import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, ConsultationType, DoctorStatus, Prisma, UserRole } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AuthUser } from '../common/security/auth-user.js';
import { AppointmentIdService } from './appointment-id.service.js';
import { AppointmentListQueryDto, CancelAppointmentDto, CreateAppointmentDto, PaymentMode, RescheduleAppointmentDto } from './appointments.dto.js';
import { FeeService } from './fee.service.js';

const activeStatuses: AppointmentStatus[] = [AppointmentStatus.PAYMENT_PENDING, AppointmentStatus.CONFIRMED, AppointmentStatus.CHECKED_IN];

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fees: FeeService,
    private readonly ids: AppointmentIdService,
    private readonly config: ConfigService,
  ) {}

  async create(user: AuthUser, dto: CreateAppointmentDto) {
    if (user.role !== UserRole.PATIENT) throw new ForbiddenException('Only patients can book appointments');
    const patient = await this.prisma.patient.findUnique({ where: { userId: user.sub } });
    if (!patient) throw new NotFoundException('Patient profile not found');
    const existing = await this.prisma.appointment.findUnique({
      where: { patientId_idempotencyKey: { patientId: patient.id, idempotencyKey: dto.idempotencyKey } },
      include: { payments: true },
    });
    if (existing) return existing;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const repeated = await tx.appointment.findUnique({
          where: { patientId_idempotencyKey: { patientId: patient.id, idempotencyKey: dto.idempotencyKey } },
          include: { payments: true },
        });
        if (repeated) return repeated;

        const startAt = new Date(dto.startAt);
        if (Number.isNaN(startAt.getTime()) || startAt <= new Date()) throw new BadRequestException('Appointment must be in the future');
        const lockKey = `${dto.doctorId}:${startAt.toISOString()}`;
        await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);

        const doctor = await tx.doctor.findFirst({
          where: { id: dto.doctorId, status: DoctorStatus.APPROVED },
          include: { clinics: { where: { clinicId: dto.clinicId, active: true }, include: { clinic: true } } },
        });
        if (!doctor) throw new NotFoundException('Approved doctor not found');
        if (dto.consultationType === ConsultationType.CLINIC && (!dto.clinicId || !doctor.clinics.length)) {
          throw new BadRequestException('Select a clinic where this doctor is active');
        }
        if (dto.consultationType === ConsultationType.ONLINE && !doctor.onlineEnabled) {
          throw new BadRequestException('Online consultation is not enabled for this doctor');
        }
        if (dto.paymentMode === PaymentMode.PAY_AT_CLINIC) {
          if (dto.consultationType !== ConsultationType.CLINIC || !doctor.clinics[0]?.clinic.payAtClinicEnabled) {
            throw new BadRequestException('Pay at clinic is not enabled for this booking');
          }
        }

        const local = new Date(startAt.getTime() + 330 * 60_000);
        const dayOfWeek = local.getUTCDay();
        const startMinute = local.getUTCHours() * 60 + local.getUTCMinutes();
        const schedule = await tx.doctorSchedule.findFirst({
          where: {
            doctorId: doctor.id,
            clinicId: dto.clinicId,
            consultationType: dto.consultationType,
            dayOfWeek,
            active: true,
            startMinute: { lte: startMinute },
            endMinute: { gt: startMinute },
          },
        });
        if (!schedule || (startMinute - schedule.startMinute) % schedule.slotDurationMinutes !== 0) {
          throw new ConflictException('Selected slot is no longer available');
        }
        if (schedule.breakStartMinute !== null && schedule.breakEndMinute !== null
          && startMinute < schedule.breakEndMinute && startMinute + schedule.slotDurationMinutes > schedule.breakStartMinute) {
          throw new ConflictException('Selected slot overlaps the doctor break');
        }
        const endAt = new Date(startAt.getTime() + schedule.slotDurationMinutes * 60_000);
        const activeCount = await tx.appointment.count({
          where: {
            doctorId: doctor.id,
            startAt,
            OR: [
              { status: { in: [AppointmentStatus.CONFIRMED, AppointmentStatus.CHECKED_IN] } },
              { status: AppointmentStatus.PAYMENT_PENDING, holdExpiresAt: { gt: new Date() } },
            ],
          },
        });
        if (activeCount >= schedule.maxAppointmentsPerSlot) throw new ConflictException('Selected slot was just booked. Please choose another slot.');

        const quoteDoctor = dto.consultationType === ConsultationType.ONLINE && doctor.onlineFeePaise !== null
          ? { ...doctor, clinicFeePaise: doctor.onlineFeePaise }
          : doctor;
        const quote = await this.fees.quote(tx, quoteDoctor, patient.id, dto.couponCode);
        const publicId = await this.ids.next(tx);
        const paymentPending = dto.paymentMode === PaymentMode.ONLINE;
        const appointment = await tx.appointment.create({
          data: {
            publicId,
            patientId: patient.id,
            doctorId: doctor.id,
            clinicId: dto.clinicId,
            consultationType: dto.consultationType,
            status: paymentPending ? AppointmentStatus.PAYMENT_PENDING : AppointmentStatus.CONFIRMED,
            startAt,
            endAt,
            patientName: dto.patientName,
            patientAge: dto.patientAge,
            patientGender: dto.patientGender,
            patientPhoneE164: dto.patientPhoneE164,
            reasonForVisit: dto.reasonForVisit,
            consultationFeePaise: quote.consultationFeePaise,
            platformFeePaise: quote.platformFeePaise,
            discountPaise: quote.discountPaise,
            totalPaise: quote.totalPaise,
            couponId: quote.couponId,
            holdExpiresAt: paymentPending
              ? new Date(Date.now() + this.config.get<number>('APPOINTMENT_HOLD_MINUTES', 10) * 60_000)
              : null,
            idempotencyKey: dto.idempotencyKey,
          },
        });
        if (quote.couponId) {
          await tx.couponUsage.create({
            data: { couponId: quote.couponId, patientId: patient.id, appointmentId: appointment.id, discountPaise: quote.discountPaise },
          });
        }
        await tx.appointmentStatusHistory.create({
          data: { appointmentId: appointment.id, toStatus: appointment.status, actorUserId: user.sub },
        });
        await tx.outboxEvent.create({
          data: {
            topic: paymentPending ? 'appointment.hold_created' : 'appointment.confirmed',
            aggregateId: appointment.id,
            payload: { appointmentId: appointment.id, publicId: appointment.publicId },
          },
        });
        return { ...appointment, quote: { commissionPaise: quote.commissionPaise, doctorSettlementPaise: quote.doctorSettlementPaise } };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const result = await this.prisma.appointment.findUnique({
          where: { patientId_idempotencyKey: { patientId: patient.id, idempotencyKey: dto.idempotencyKey } },
        });
        if (result) return result;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException('The selected slot changed while booking. Please retry or choose another slot.');
      }
      throw error;
    }
  }

  async list(user: AuthUser, query: AppointmentListQueryDto) {
    const owner = user.role === UserRole.PATIENT
      ? await this.prisma.patient.findUnique({ where: { userId: user.sub } })
      : await this.prisma.doctor.findUnique({ where: { userId: user.sub } });
    if (!owner) throw new NotFoundException('Profile not found');
    const now = new Date();
    const statusFilter: Prisma.AppointmentWhereInput = query.view === 'completed'
      ? { status: AppointmentStatus.COMPLETED }
      : query.view === 'cancelled'
        ? { status: { in: [AppointmentStatus.CANCELLED_BY_DOCTOR, AppointmentStatus.CANCELLED_BY_PATIENT, AppointmentStatus.EXPIRED] } }
        : { startAt: { gte: now }, status: { in: activeStatuses } };
    return this.prisma.appointment.findMany({
      where: { ...(user.role === UserRole.PATIENT ? { patientId: owner.id } : { doctorId: owner.id }), ...statusFilter },
      include: {
        doctor: { include: { user: { select: { displayName: true } } } },
        clinic: { include: { addresses: true } },
        payments: true,
      },
      orderBy: { startAt: query.view === 'upcoming' ? 'asc' : 'desc' },
      take: 100,
    });
  }

  async reschedule(user: AuthUser, appointmentId: string, dto: RescheduleAppointmentDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${'appointment-mutation:' + appointmentId}, 0))`);
      const previousRequest = await tx.appointmentStatusHistory.findUnique({ where: { requestKey: dto.idempotencyKey } });
      if (previousRequest?.appointmentId === appointmentId) return tx.appointment.findUnique({ where: { id: appointmentId } });
      if (previousRequest) throw new ConflictException('Idempotency key was already used for another appointment');

      const appointment = await tx.appointment.findUnique({ where: { id: appointmentId }, include: { patient: true } });
      if (!appointment || appointment.patient.userId !== user.sub) throw new NotFoundException('Appointment not found');
      if (appointment.status !== AppointmentStatus.CONFIRMED) throw new ConflictException('Only confirmed appointments can be rescheduled');
      const newStart = new Date(dto.startAt);
      const minimumNotice = this.config.get<number>('RESCHEDULE_MIN_NOTICE_MINUTES', 120) * 60_000;
      if (Number.isNaN(newStart.getTime()) || newStart.getTime() - Date.now() < minimumNotice) {
        throw new BadRequestException('The selected time does not meet the rescheduling notice period');
      }
      const slotKey = `${appointment.doctorId}:${newStart.toISOString()}`;
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${slotKey}, 0))`);
      const local = new Date(newStart.getTime() + 330 * 60_000);
      const startMinute = local.getUTCHours() * 60 + local.getUTCMinutes();
      const schedule = await tx.doctorSchedule.findFirst({
        where: {
          doctorId: appointment.doctorId,
          clinicId: appointment.clinicId,
          consultationType: appointment.consultationType,
          dayOfWeek: local.getUTCDay(),
          active: true,
          startMinute: { lte: startMinute },
          endMinute: { gt: startMinute },
        },
      });
      if (!schedule || (startMinute - schedule.startMinute) % schedule.slotDurationMinutes !== 0) {
        throw new ConflictException('Selected slot is no longer available');
      }
      const overlapsBreak = schedule.breakStartMinute !== null && schedule.breakEndMinute !== null
        && startMinute < schedule.breakEndMinute && startMinute + schedule.slotDurationMinutes > schedule.breakStartMinute;
      if (overlapsBreak) throw new ConflictException('Selected slot overlaps the doctor break');
      const reserved = await tx.appointment.count({
        where: {
          id: { not: appointment.id }, doctorId: appointment.doctorId, startAt: newStart,
          OR: [
            { status: { in: [AppointmentStatus.CONFIRMED, AppointmentStatus.CHECKED_IN] } },
            { status: AppointmentStatus.PAYMENT_PENDING, holdExpiresAt: { gt: new Date() } },
          ],
        },
      });
      if (reserved >= schedule.maxAppointmentsPerSlot) throw new ConflictException('Selected slot was just booked');
      const oldStart = appointment.startAt;
      const updated = await tx.appointment.update({
        where: { id: appointment.id },
        data: { startAt: newStart, endAt: new Date(newStart.getTime() + schedule.slotDurationMinutes * 60_000) },
      });
      await tx.appointmentStatusHistory.create({
        data: {
          appointmentId: appointment.id,
          fromStatus: AppointmentStatus.CONFIRMED,
          toStatus: AppointmentStatus.CONFIRMED,
          reason: `Rescheduled from ${oldStart.toISOString()}`,
          actorUserId: user.sub,
          requestKey: dto.idempotencyKey,
        },
      });
      await tx.outboxEvent.create({
        data: { topic: 'appointment.rescheduled', aggregateId: appointment.id, payload: { appointmentId: appointment.id, oldStartAt: oldStart.toISOString(), newStartAt: newStart.toISOString() } },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async complete(user: AuthUser, appointmentId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${'appointment-mutation:' + appointmentId}, 0))`);
      const appointment = await tx.appointment.findUnique({ where: { id: appointmentId }, include: { doctor: true } });
      if (!appointment) throw new NotFoundException('Appointment not found');
      if (user.role !== UserRole.ADMIN && appointment.doctor.userId !== user.sub) throw new ForbiddenException('You cannot complete this appointment');
      if (appointment.status === AppointmentStatus.COMPLETED) return appointment;
      const completable: AppointmentStatus[] = [AppointmentStatus.CONFIRMED, AppointmentStatus.CHECKED_IN];
      if (!completable.includes(appointment.status)) {
        throw new ConflictException('Only an active confirmed appointment can be completed');
      }
      if (appointment.startAt > new Date()) throw new ConflictException('A future appointment cannot be completed');
      const updated = await tx.appointment.update({ where: { id: appointment.id }, data: { status: AppointmentStatus.COMPLETED } });
      await tx.appointmentStatusHistory.create({
        data: { appointmentId: appointment.id, fromStatus: appointment.status, toStatus: AppointmentStatus.COMPLETED, reason: 'Consultation completed', actorUserId: user.sub },
      });
      await tx.outboxEvent.create({
        data: { topic: 'appointment.completed', aggregateId: appointment.id, payload: { appointmentId: appointment.id } },
      });
      return updated;
    });
  }

  async cancel(user: AuthUser, appointmentId: string, dto: CancelAppointmentDto) {
    return this.prisma.$transaction(async (tx) => {
      const appointment = await tx.appointment.findUnique({
        where: { id: appointmentId },
        include: { patient: true, doctor: true, payments: { where: { status: 'SUCCESSFUL' } } },
      });
      if (!appointment) throw new NotFoundException('Appointment not found');
      const owns = user.role === UserRole.PATIENT ? appointment.patient.userId === user.sub : appointment.doctor.userId === user.sub;
      if (!owns && user.role !== UserRole.ADMIN) throw new ForbiddenException('You cannot cancel this appointment');
      const cancellable: AppointmentStatus[] = [AppointmentStatus.PAYMENT_PENDING, AppointmentStatus.CONFIRMED];
      if (!cancellable.includes(appointment.status)) {
        throw new ConflictException('This appointment can no longer be cancelled');
      }
      const next = user.role === UserRole.DOCTOR ? AppointmentStatus.CANCELLED_BY_DOCTOR : AppointmentStatus.CANCELLED_BY_PATIENT;
      const updated = await tx.appointment.update({
        where: { id: appointment.id },
        data: { status: next, cancellationReason: dto.reason, cancelledAt: new Date(), holdExpiresAt: null },
      });
      await tx.appointmentStatusHistory.create({
        data: { appointmentId, fromStatus: appointment.status, toStatus: next, reason: dto.reason, actorUserId: user.sub },
      });
      await tx.outboxEvent.create({
        data: {
          topic: 'appointment.cancelled',
          aggregateId: appointment.id,
          payload: { appointmentId: appointment.id, reason: dto.reason },
        },
      });
      if (appointment.payments.length) {
        await tx.outboxEvent.create({
          data: { topic: 'refund.requested', aggregateId: appointment.payments[0].id, payload: { appointmentId: appointment.id, paymentId: appointment.payments[0].id, reason: dto.reason } },
        });
      }
      return updated;
    });
  }
}
