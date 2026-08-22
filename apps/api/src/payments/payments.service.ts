import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppointmentStatus, PaymentStatus, Prisma, UserRole } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AuthUser } from '../common/security/auth-user.js';
import { RazorpayClient } from './razorpay.client.js';
import { RazorpayWebhookPayload } from './payments.dto.js';
import { verifyRazorpayWebhookSignature } from './webhook-signature.js';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpay: RazorpayClient,
    private readonly config: ConfigService,
  ) {}

  async createOrder(user: AuthUser, appointmentId: string) {
    if (user.role !== UserRole.PATIENT) throw new ForbiddenException('Only patients can initiate payment');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${'payment-order:' + appointmentId}, 0))`);
      const appointment = await tx.appointment.findUnique({
        where: { id: appointmentId },
        include: { patient: true, payments: { orderBy: { createdAt: 'desc' } } },
      });
      if (!appointment || appointment.patient.userId !== user.sub) throw new NotFoundException('Appointment not found');
      if (appointment.status !== AppointmentStatus.PAYMENT_PENDING || !appointment.holdExpiresAt || appointment.holdExpiresAt <= new Date()) {
        throw new BadRequestException('Appointment hold has expired or does not require online payment');
      }
      const existing = appointment.payments.find((payment) => payment.status === PaymentStatus.PENDING || payment.status === PaymentStatus.SUCCESSFUL);
      if (existing) return { payment: existing, keyId: this.config.get<string>('RAZORPAY_KEY_ID') };

      const order = await this.razorpay.createOrder({
        amountPaise: appointment.totalPaise,
        receipt: appointment.publicId,
        idempotencyKey: `${appointment.id}:payment-order`,
      });
      const payment = await tx.payment.create({
        data: {
          appointmentId: appointment.id,
          gatewayOrderId: order.id,
          amountPaise: order.amount,
          currency: order.currency,
        },
      });
      return { payment, keyId: this.config.get<string>('RAZORPAY_KEY_ID') };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
  }

  async confirmTestPayment(user: AuthUser, appointmentId: string) {
    const enabled = this.config.get<boolean>('ENABLE_TEST_PAYMENT', false);
    if (!enabled || this.config.get<string>('NODE_ENV') === 'production') {
      throw new NotFoundException('Payment route not found');
    }
    if (user.role !== UserRole.PATIENT) throw new ForbiddenException('Only patients can confirm test payments');

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${'test-payment:' + appointmentId}, 0))`);
      const appointment = await tx.appointment.findUnique({
        where: { id: appointmentId },
        include: { patient: true, payments: { orderBy: { createdAt: 'desc' } } },
      });
      if (!appointment || appointment.patient.userId !== user.sub) throw new NotFoundException('Appointment not found');
      const successful = appointment.payments.find((payment) => payment.status === PaymentStatus.SUCCESSFUL);
      if (successful && appointment.status === AppointmentStatus.CONFIRMED) {
        return { appointment, payment: successful, testMode: true };
      }
      if (appointment.status !== AppointmentStatus.PAYMENT_PENDING || !appointment.holdExpiresAt || appointment.holdExpiresAt <= new Date()) {
        throw new BadRequestException('Appointment hold has expired or does not require payment');
      }

      const pending = appointment.payments.find((payment) => payment.status === PaymentStatus.PENDING);
      const payment = pending ?? await tx.payment.create({
        data: {
          appointmentId: appointment.id,
          gatewayOrderId: `test_order_${appointment.id.replaceAll('-', '')}`,
          amountPaise: appointment.totalPaise,
          currency: 'INR',
        },
      });
      const gatewayPaymentId = payment.gatewayPaymentId ?? `test_pay_${appointment.id.replaceAll('-', '')}`;
      await this.capture(tx, { ...payment, appointment }, gatewayPaymentId, 'test');
      const confirmed = await tx.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
      const captured = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
      return { appointment: confirmed, payment: captured, testMode: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async handleWebhook(rawBody: Buffer, signature: string | undefined, eventIdHeader: string | undefined) {
    const secret = this.config.getOrThrow<string>('RAZORPAY_WEBHOOK_SECRET');
    if (!signature || !verifyRazorpayWebhookSignature(rawBody, signature, secret)) throw new UnauthorizedException('Invalid payment webhook signature');
    const body = JSON.parse(rawBody.toString('utf8')) as RazorpayWebhookPayload;
    const payloadHash = createHash('sha256').update(rawBody).digest('hex');
    const eventId = eventIdHeader ?? payloadHash;

    const prior = await this.prisma.paymentWebhookEvent.findUnique({ where: { provider_eventId: { provider: 'razorpay', eventId } } });
    if (prior?.processedAt) return { received: true, duplicate: true };

    try {
      await this.prisma.$transaction(async (tx) => {
        const webhook = await tx.paymentWebhookEvent.upsert({
          where: { provider_eventId: { provider: 'razorpay', eventId } },
          update: {},
          create: { provider: 'razorpay', eventId, eventType: body.event, payloadHash },
        });
        if (webhook.processedAt) return;
        const entity = body.payload.payment?.entity;
        if (!entity?.order_id) {
          await tx.paymentWebhookEvent.update({ where: { id: webhook.id }, data: { processedAt: new Date() } });
          return;
        }
        const payment = await tx.payment.findUnique({ where: { gatewayOrderId: entity.order_id }, include: { appointment: true } });
        if (!payment) throw new NotFoundException('Payment order was not created by CareBook');

        if (body.event === 'payment.captured') {
          if (entity.amount !== payment.amountPaise) {
            await tx.appointment.update({ where: { id: payment.appointmentId }, data: { status: AppointmentStatus.PAYMENT_REVIEW } });
            await tx.outboxEvent.create({
              data: { topic: 'payment.amount_mismatch', aggregateId: payment.id, payload: { expected: payment.amountPaise, received: entity.amount } },
            });
          } else {
            await this.capture(tx, payment, entity.id, entity.method);
          }
        } else if (body.event === 'payment.failed') {
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: PaymentStatus.FAILED, gatewayPaymentId: entity.id, failureCode: entity.error_code, failureDescription: entity.error_description },
          });
          if (payment.appointment.status === AppointmentStatus.PAYMENT_PENDING) {
            await tx.appointment.update({ where: { id: payment.appointmentId }, data: { status: AppointmentStatus.EXPIRED, holdExpiresAt: null } });
          }
        }
        await tx.paymentWebhookEvent.update({ where: { id: webhook.id }, data: { processedAt: new Date() } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return { received: true, duplicate: true };
      throw error;
    }
    return { received: true };
  }

  private async capture(
    tx: Prisma.TransactionClient,
    payment: { id: string; appointmentId: string; appointment: { status: AppointmentStatus } },
    gatewayPaymentId: string,
    method?: string,
  ): Promise<void> {
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.SUCCESSFUL, gatewayPaymentId, method, capturedAt: new Date() },
    });
    const canConfirm = payment.appointment.status === AppointmentStatus.PAYMENT_PENDING;
    if (canConfirm) {
      await tx.appointment.update({ where: { id: payment.appointmentId }, data: { status: AppointmentStatus.CONFIRMED, holdExpiresAt: null } });
      await tx.appointmentStatusHistory.create({
        data: { appointmentId: payment.appointmentId, fromStatus: AppointmentStatus.PAYMENT_PENDING, toStatus: AppointmentStatus.CONFIRMED, reason: 'Payment captured' },
      });
      await tx.outboxEvent.create({
        data: { topic: 'appointment.confirmed', aggregateId: payment.appointmentId, payload: { appointmentId: payment.appointmentId } },
      });
    } else {
      await tx.outboxEvent.create({
        data: {
          topic: 'refund.required',
          aggregateId: payment.id,
          payload: { appointmentId: payment.appointmentId, paymentId: payment.id, reason: 'Payment captured after hold ended' },
        },
      });
    }
  }
}
