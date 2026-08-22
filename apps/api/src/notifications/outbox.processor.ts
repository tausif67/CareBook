import { Injectable } from '@nestjs/common';
import { NotificationChannel, NotificationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { FirebasePushService } from './firebase-push.service.js';

@Injectable()
export class OutboxProcessor {
  constructor(private readonly prisma: PrismaService, private readonly push: FirebasePushService) {}

  async processBatch(limit = 25): Promise<number> {
    await this.expireAppointmentHolds();
    const processed = await this.prisma.$transaction(async (tx) => {
      const events = await tx.$queryRaw<Array<{ id: string; topic: string; aggregate_id: string; payload: Prisma.JsonValue }>>(Prisma.sql`
        SELECT id, topic, aggregate_id, payload
        FROM outbox_events
        WHERE processed_at IS NULL AND available_at <= now()
          AND topic IN ('appointment.confirmed','appointment.rescheduled','appointment.cancelled','appointment.completed','doctor.verification_changed','refund.completed')
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      `);
      for (const event of events) {
        try {
          if (event.topic === 'appointment.confirmed') await this.queueAppointmentReminders(tx, event.aggregate_id, false);
          if (event.topic === 'appointment.rescheduled') await this.queueAppointmentReminders(tx, event.aggregate_id, true);
          if (event.topic === 'appointment.cancelled') await this.queueAppointmentState(tx, event.aggregate_id, 'appointment_cancelled');
          if (event.topic === 'appointment.completed') await this.queueAppointmentState(tx, event.aggregate_id, 'appointment_completed');
          if (event.topic === 'doctor.verification_changed') await this.queueDoctorVerification(tx, event.aggregate_id);
          if (event.topic === 'refund.completed') await this.queueRefundComplete(tx, event.aggregate_id);
          await tx.outboxEvent.update({ where: { id: event.id }, data: { processedAt: new Date(), attempts: { increment: 1 } } });
        } catch {
          await tx.outboxEvent.update({
            where: { id: event.id },
            data: { attempts: { increment: 1 }, availableAt: new Date(Date.now() + 60_000) },
          });
        }
      }
      return events.length;
    });
    await this.deliverDuePush();
    return processed;
  }

  private async deliverDuePush(): Promise<void> {
    if (!this.push.enabled) return;
    const due = await this.prisma.notification.findMany({
      where: {
        channel: NotificationChannel.PUSH,
        status: NotificationStatus.QUEUED,
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    for (const notification of due) {
      const devices = await this.prisma.deviceToken.findMany({ where: { userId: notification.userId, active: true }, take: 500 });
      if (!devices.length) continue;
      const rawData = notification.data && typeof notification.data === 'object' && !Array.isArray(notification.data)
        ? notification.data as Record<string, unknown>
        : {};
      const result = await this.push.send(devices.map((device) => device.token), {
        title: notification.title,
        body: notification.body,
        data: Object.fromEntries(Object.entries(rawData).map(([key, value]) => [key, String(value)])),
      });
      if (!result) continue;
      const invalid = result.responses.flatMap((response, index) => {
        const code = response.error?.code;
        return code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token'
          ? [devices[index].token]
          : [];
      });
      if (invalid.length) await this.prisma.deviceToken.updateMany({ where: { token: { in: invalid } }, data: { active: false } });
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { status: result.successCount > 0 ? NotificationStatus.SENT : NotificationStatus.FAILED, sentAt: result.successCount > 0 ? new Date() : null },
      });
    }
  }

  private async expireAppointmentHolds(): Promise<void> {
    const expired = await this.prisma.appointment.findMany({
      where: { status: 'PAYMENT_PENDING', holdExpiresAt: { lt: new Date() } },
      select: { id: true },
      take: 100,
    });
    for (const appointment of expired) {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.appointment.updateMany({
          where: { id: appointment.id, status: 'PAYMENT_PENDING', holdExpiresAt: { lt: new Date() } },
          data: { status: 'EXPIRED', holdExpiresAt: null },
        });
        if (updated.count) {
          await tx.appointmentStatusHistory.create({
            data: { appointmentId: appointment.id, fromStatus: 'PAYMENT_PENDING', toStatus: 'EXPIRED', reason: 'Payment hold expired' },
          });
        }
      });
    }
  }

  private async queueAppointmentReminders(tx: Prisma.TransactionClient, appointmentId: string, rescheduled: boolean): Promise<void> {
    const appointment = await tx.appointment.findUnique({
      where: { id: appointmentId },
      include: { patient: true, doctor: { include: { user: true } } },
    });
    if (!appointment) return;
    if (rescheduled) {
      await tx.notification.updateMany({
        where: {
          userId: appointment.patient.userId,
          status: NotificationStatus.QUEUED,
          template: { in: ['appointment_reminder_24h', 'appointment_reminder_2h'] },
          data: { path: ['appointmentId'], equals: appointment.id },
        },
        data: { status: NotificationStatus.FAILED },
      });
    }
    const reminders = [
      { minutes: 24 * 60, template: 'appointment_reminder_24h' },
      { minutes: 2 * 60, template: 'appointment_reminder_2h' },
    ];
    await tx.notification.create({
      data: {
        userId: appointment.patient.userId,
        channel: NotificationChannel.PUSH,
        template: rescheduled ? 'appointment_rescheduled' : 'appointment_confirmed',
        title: rescheduled ? 'Appointment rescheduled' : 'Appointment confirmed',
        body: `${appointment.publicId} with ${appointment.doctor.user.displayName} is ${rescheduled ? 'rescheduled' : 'confirmed'}.`,
        data: { appointmentId: appointment.id },
      },
    });
    for (const reminder of reminders) {
      const scheduledAt = new Date(appointment.startAt.getTime() - reminder.minutes * 60_000);
      if (scheduledAt <= new Date()) continue;
      await tx.notification.create({
        data: {
          userId: appointment.patient.userId,
          channel: NotificationChannel.PUSH,
          template: reminder.template,
          title: 'Appointment reminder',
          body: `Your appointment ${appointment.publicId} is coming up.`,
          data: { appointmentId: appointment.id },
          scheduledAt,
        },
      });
    }
  }

  private async queueAppointmentState(tx: Prisma.TransactionClient, appointmentId: string, template: 'appointment_cancelled' | 'appointment_completed'): Promise<void> {
    const appointment = await tx.appointment.findUnique({ where: { id: appointmentId }, include: { patient: true, doctor: { include: { user: true } } } });
    if (!appointment) return;
    await tx.notification.updateMany({
      where: {
        userId: appointment.patient.userId,
        status: NotificationStatus.QUEUED,
        template: { in: ['appointment_reminder_24h', 'appointment_reminder_2h'] },
        data: { path: ['appointmentId'], equals: appointment.id },
      },
      data: { status: NotificationStatus.FAILED },
    });
    await tx.notification.create({
      data: {
        userId: appointment.patient.userId,
        channel: NotificationChannel.PUSH,
        template,
        title: template === 'appointment_completed' ? 'Consultation completed' : 'Appointment cancelled',
        body: template === 'appointment_completed'
          ? `Your consultation ${appointment.publicId} is complete. You can now leave a verified review.`
          : `Your appointment ${appointment.publicId} has been cancelled.`,
        data: { appointmentId: appointment.id },
      },
    });
  }

  private async queueDoctorVerification(tx: Prisma.TransactionClient, doctorId: string): Promise<void> {
    const doctor = await tx.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor) return;
    await tx.notification.create({
      data: {
        userId: doctor.userId,
        channel: NotificationChannel.PUSH,
        template: 'doctor_verification_changed',
        title: 'Verification status updated',
        body: `Your CareBook doctor profile is now ${doctor.status.replaceAll('_', ' ').toLowerCase()}.`,
        data: { doctorId, status: doctor.status },
      },
    });
  }

  private async queueRefundComplete(tx: Prisma.TransactionClient, paymentId: string): Promise<void> {
    const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { appointment: { include: { patient: true } } } });
    if (!payment) return;
    await tx.notification.create({
      data: {
        userId: payment.appointment.patient.userId,
        channel: NotificationChannel.PUSH,
        template: 'refund_completed',
        title: 'Refund processed',
        body: `The refund for ${payment.appointment.publicId} has been processed.`,
        data: { appointmentId: payment.appointment.id, paymentId },
      },
    });
  }
}
