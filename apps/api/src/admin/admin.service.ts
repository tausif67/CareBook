import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, DoctorStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { ObjectStorageService } from '../common/storage/object-storage.service.js';
import { ReviewDoctorDto, ReviewDocumentDto, SetCommissionDto } from './admin.dto.js';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService, private readonly storage: ObjectStorageService) {}

  async analytics() {
    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1); startOfMonth.setUTCHours(0, 0, 0, 0);
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const [patients, doctors, verified, pending, todayAppointments, monthlyAppointments, money] = await this.prisma.$transaction([
      this.prisma.patient.count(),
      this.prisma.doctor.count(),
      this.prisma.doctor.count({ where: { status: DoctorStatus.APPROVED } }),
      this.prisma.doctor.count({ where: { status: DoctorStatus.PENDING_VERIFICATION } }),
      this.prisma.appointment.count({ where: { startAt: { gte: startOfDay } } }),
      this.prisma.appointment.count({ where: { startAt: { gte: startOfMonth } } }),
      this.prisma.payment.aggregate({
        where: { status: { in: [PaymentStatus.SUCCESSFUL, PaymentStatus.PARTIALLY_REFUNDED] }, createdAt: { gte: startOfMonth } },
        _sum: { amountPaise: true },
      }),
    ]);
    const revenue = await this.prisma.appointment.aggregate({
      where: { createdAt: { gte: startOfMonth }, status: { notIn: [AppointmentStatus.EXPIRED, AppointmentStatus.CANCELLED_BY_PATIENT, AppointmentStatus.CANCELLED_BY_DOCTOR] } },
      _sum: { platformFeePaise: true },
    });
    return {
      totalPatients: patients,
      totalDoctors: doctors,
      verifiedDoctors: verified,
      pendingVerification: pending,
      todayAppointments,
      monthlyAppointments,
      grossBookingValuePaise: money._sum.amountPaise ?? 0,
      platformRevenuePaise: revenue._sum.platformFeePaise ?? 0,
    };
  }

  listDoctors(status?: DoctorStatus) {
    return this.prisma.doctor.findMany({
      where: status ? { status } : {},
      include: {
        user: true,
        documents: { select: { id: true, type: true, fileName: true, contentType: true, sizeBytes: true, uploadedAt: true, status: true, rejectionReason: true, createdAt: true } },
        specializations: { include: { specialization: true } },
        clinics: { include: { clinic: true } },
      },
      orderBy: { submittedAt: 'asc' },
      take: 200,
    });
  }

  async reviewDoctor(actorUserId: string, doctorId: string, dto: ReviewDoctorDto) {
    const allowed: DoctorStatus[] = [DoctorStatus.APPROVED, DoctorStatus.REJECTED, DoctorStatus.CORRECTION_REQUIRED, DoctorStatus.SUSPENDED];
    if (!allowed.includes(dto.status)) throw new BadRequestException('Invalid verification decision');
    const current = await this.prisma.doctor.findUnique({ where: { id: doctorId }, include: { documents: true } });
    if (!current) throw new NotFoundException('Doctor not found');
    if (dto.status === DoctorStatus.APPROVED && current.documents.some((document) => document.status !== 'APPROVED')) {
      throw new BadRequestException('All mandatory documents must be manually approved first');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.doctor.update({
        where: { id: doctorId },
        data: {
          status: dto.status,
          verificationNotes: dto.notes,
          verifiedAt: dto.status === DoctorStatus.APPROVED ? new Date() : null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: `doctor.${dto.status.toLowerCase()}`,
          entityType: 'doctor',
          entityId: doctorId,
          before: { status: current.status, notes: current.verificationNotes },
          after: { status: updated.status, notes: updated.verificationNotes },
        },
      });
      await tx.outboxEvent.create({
        data: { topic: 'doctor.verification_changed', aggregateId: doctorId, payload: { doctorId, status: updated.status } },
      });
      return updated;
    });
  }

  async reviewDocument(actorUserId: string, documentId: string, dto: ReviewDocumentDto) {
    const current = await this.prisma.doctorDocument.findUnique({ where: { id: documentId } });
    if (!current) throw new NotFoundException('Doctor document not found');
    if (!current.uploadedAt) throw new BadRequestException('Document upload is not complete');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.doctorDocument.update({
        where: { id: documentId },
        data: { status: dto.status, rejectionReason: dto.rejectionReason, reviewedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: 'doctor_document.reviewed',
          entityType: 'doctor_document',
          entityId: documentId,
          before: { status: current.status },
          after: { status: updated.status, rejectionReason: updated.rejectionReason },
        },
      });
      return updated;
    });
  }

  async documentDownload(actorUserId: string, documentId: string) {
    const document = await this.prisma.doctorDocument.findUnique({ where: { id: documentId } });
    if (!document?.uploadedAt) throw new NotFoundException('Completed doctor document upload not found');
    const download = await this.storage.createDownloadUrl(document.storageKey);
    await this.prisma.auditLog.create({
      data: { actorUserId, action: 'doctor_document.downloaded', entityType: 'doctor_document', entityId: document.id },
    });
    return { ...download, fileName: document.fileName, contentType: document.contentType };
  }

  listPatients() {
    return this.prisma.patient.findMany({ include: { user: true }, orderBy: { createdAt: 'desc' }, take: 200 });
  }

  listAppointments() {
    return this.prisma.appointment.findMany({ include: { patient: { include: { user: true } }, doctor: { include: { user: true } }, payments: true }, orderBy: { createdAt: 'desc' }, take: 200 });
  }

  listPayments() {
    return this.prisma.payment.findMany({ include: { appointment: true, refunds: true }, orderBy: { createdAt: 'desc' }, take: 200 });
  }

  async setCommission(actorUserId: string, dto: SetCommissionDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.commissionRule.updateMany({ where: { doctorId: dto.doctorId ?? null, active: true }, data: { active: false, effectiveTo: new Date() } });
      const created = await tx.commissionRule.create({ data: { ...dto, effectiveFrom: new Date() } });
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: 'commission.created',
          entityType: 'commission_rule',
          entityId: created.id,
          after: {
            doctorId: created.doctorId,
            percentageBasisPoints: created.percentageBasisPoints,
            fixedPlatformFeePaise: created.fixedPlatformFeePaise,
            patientConvenienceFeePaise: created.patientConvenienceFeePaise,
          },
        },
      });
      return created;
    });
  }
}
