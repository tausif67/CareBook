import { Injectable } from '@nestjs/common';
import { PaymentStatus, Prisma, RefundStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { RazorpayClient } from './razorpay.client.js';

interface RefundEvent {
  id: string;
  aggregate_id: string;
  attempts: number;
  payload: Prisma.JsonValue;
}

@Injectable()
export class RefundProcessor {
  constructor(private readonly prisma: PrismaService, private readonly razorpay: RazorpayClient) {}

  async processBatch(limit = 10): Promise<number> {
    const events = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.$queryRaw<RefundEvent[]>(Prisma.sql`
        SELECT id, aggregate_id, attempts, payload
        FROM outbox_events
        WHERE processed_at IS NULL AND available_at <= now()
          AND topic IN ('refund.requested','refund.required')
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      `);
      for (const event of claimed) {
        await tx.outboxEvent.update({
          where: { id: event.id },
          data: { attempts: { increment: 1 }, availableAt: new Date(Date.now() + 5 * 60_000) },
        });
      }
      return claimed;
    });

    for (const event of events) await this.processEvent(event);
    return events.length;
  }

  private async processEvent(event: RefundEvent): Promise<void> {
    const payment = await this.prisma.payment.findUnique({ where: { id: event.aggregate_id }, include: { refunds: { orderBy: { createdAt: 'desc' } } } });
    if (!payment) {
      await this.failEvent(event, 'Payment record not found'); return;
    }
    if (payment.status === PaymentStatus.REFUNDED) {
      await this.prisma.outboxEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } }); return;
    }
    if (!payment.gatewayPaymentId || payment.status !== PaymentStatus.SUCCESSFUL) {
      await this.failEvent(event, 'Payment is not eligible for an automatic refund'); return;
    }
    const payload = event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
      ? event.payload as Record<string, unknown> : {};
    const reason = typeof payload.reason === 'string' ? payload.reason : 'Appointment cancellation';
    let refund = payment.refunds[0];
    if (!refund) {
      refund = await this.prisma.refund.create({
        data: { paymentId: payment.id, amountPaise: payment.amountPaise, reason, status: RefundStatus.PENDING },
      });
    }
    try {
      await this.prisma.refund.update({ where: { id: refund.id }, data: { status: RefundStatus.PROCESSING, failureReason: null } });
      const provider = await this.razorpay.refundPayment({
        gatewayPaymentId: payment.gatewayPaymentId,
        amountPaise: refund.amountPaise,
        idempotencyKey: `carebook-refund-${refund.id}`,
      });
      if (!['processed', 'processed_successfully'].includes(provider.status.toLowerCase())) {
        await this.prisma.refund.update({ where: { id: refund.id }, data: { gatewayRefundId: provider.id, status: RefundStatus.PROCESSING } });
        await this.retryEvent(event); return;
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.refund.update({ where: { id: refund.id }, data: { gatewayRefundId: provider.id, status: RefundStatus.SUCCESSFUL } });
        await tx.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.REFUNDED } });
        await tx.outboxEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } });
        await tx.outboxEvent.create({ data: { topic: 'refund.completed', aggregateId: payment.id, payload: { paymentId: payment.id, refundId: refund.id } } });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Refund provider request failed';
      await this.prisma.refund.update({ where: { id: refund.id }, data: { status: RefundStatus.FAILED, failureReason: message.slice(0, 500) } });
      await this.retryEvent(event);
    }
  }

  private retryEvent(event: RefundEvent): Promise<unknown> {
    const delayMinutes = Math.min(60, 2 ** Math.min(event.attempts + 1, 6));
    return this.prisma.outboxEvent.update({ where: { id: event.id }, data: { availableAt: new Date(Date.now() + delayMinutes * 60_000) } });
  }

  private async failEvent(event: RefundEvent, reason: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id: event.id },
      data: { availableAt: new Date(Date.now() + 60 * 60_000), payload: { ...(event.payload as object), lastError: reason } },
    });
  }
}
