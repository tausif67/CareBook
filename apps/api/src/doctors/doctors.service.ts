import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, DoctorStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { ObjectStorageService } from '../common/storage/object-storage.service.js';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { AvailabilityQueryDto, DoctorSearchDto, StartDoctorDocumentUploadDto, UpdateDoctorProfileDto, UpsertScheduleDto } from './doctors.dto.js';

const activeStatuses: AppointmentStatus[] = [
  AppointmentStatus.PAYMENT_PENDING,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.CHECKED_IN,
];

@Injectable()
export class DoctorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
    private readonly config: ConfigService,
  ) {}

  private async ownDoctor(userId: string) {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
    if (!doctor) throw new ForbiddenException('Doctor profile is required');
    return doctor;
  }

  async updateProfile(userId: string, dto: UpdateDoctorProfileDto) {
    const doctor = await this.ownDoctor(userId);
    if (doctor.status === DoctorStatus.APPROVED || doctor.status === DoctorStatus.SUSPENDED) {
      throw new ConflictException('Approved or suspended profiles require admin-assisted changes');
    }
    if (dto.clinicId && !await this.prisma.clinic.findFirst({ where: { id: dto.clinicId, active: true } })) {
      throw new BadRequestException('Selected clinic is unavailable');
    }
    return this.prisma.doctor.update({
      where: { id: doctor.id },
      data: {
        registrationNumber: dto.registrationNumber,
        registrationCouncil: dto.registrationCouncil,
        registrationYear: dto.registrationYear,
        gender: dto.gender,
        qualifications: dto.qualifications,
        experienceYears: dto.experienceYears,
        about: dto.about,
        languages: dto.languages,
        photoUrl: dto.photoUrl,
        clinicFeePaise: dto.clinicFeePaise,
        onlineFeePaise: dto.onlineFeePaise,
        onlineEnabled: dto.onlineEnabled,
        status: DoctorStatus.DRAFT,
        specializations: {
          deleteMany: {},
          create: dto.specializationIds.map((specializationId, index) => ({ specializationId, primary: index === 0 })),
        },
        ...(dto.clinicId ? { clinics: { deleteMany: {}, create: { clinicId: dto.clinicId } } } : {}),
      },
      include: { specializations: { include: { specialization: true } }, documents: true },
    });
  }

  async startDocumentUpload(userId: string, dto: StartDoctorDocumentUploadDto) {
    const doctor = await this.ownDoctor(userId);
    const editableStatuses: DoctorStatus[] = [DoctorStatus.DRAFT, DoctorStatus.CORRECTION_REQUIRED, DoctorStatus.REJECTED];
    if (!editableStatuses.includes(doctor.status)) {
      throw new ForbiddenException('Documents can be changed only while the profile is editable');
    }
    const maximum = this.config.get<number>('DOCUMENT_MAX_SIZE_BYTES', 10_485_760);
    if (dto.sizeBytes > maximum) throw new BadRequestException(`Document exceeds the ${maximum} byte limit`);
    const storageKey = `doctors/${doctor.id}/documents/${randomUUID()}`;
    const upload = await this.storage.createUploadUrl({ key: storageKey, contentType: dto.contentType, sha256: dto.sha256.toLowerCase() });
    const document = await this.prisma.doctorDocument.create({
      data: {
        doctorId: doctor.id,
        type: dto.type,
        storageKey,
        checksum: dto.sha256.toLowerCase(),
        fileName: dto.fileName,
        contentType: dto.contentType,
        sizeBytes: dto.sizeBytes,
      },
      select: { id: true, type: true, fileName: true, contentType: true, sizeBytes: true, status: true, createdAt: true },
    });
    return { document, ...upload };
  }

  async completeDocumentUpload(userId: string, documentId: string) {
    const document = await this.prisma.doctorDocument.findUnique({ where: { id: documentId }, include: { doctor: true } });
    if (!document || document.doctor.userId !== userId) throw new NotFoundException('Document upload not found');
    if (!document.contentType || !document.sizeBytes) throw new BadRequestException('Document upload metadata is incomplete');
    if (document.uploadedAt) return document;
    await this.storage.assertUploaded({
      key: document.storageKey,
      contentType: document.contentType,
      sizeBytes: document.sizeBytes,
      sha256: document.checksum,
    });
    return this.prisma.doctorDocument.update({
      where: { id: document.id },
      data: { uploadedAt: new Date() },
      select: { id: true, type: true, fileName: true, contentType: true, sizeBytes: true, status: true, uploadedAt: true },
    });
  }

  async submit(userId: string) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { userId },
      include: { documents: true, specializations: true, clinics: { where: { active: true } } },
    });
    if (!doctor) throw new NotFoundException('Doctor profile not found');
    if (!doctor.registrationNumber || !doctor.registrationCouncil || !doctor.qualifications || !doctor.specializations.length || !doctor.documents.length) {
      throw new BadRequestException('Complete professional details, specialization, and verification documents before submission');
    }
    if (!doctor.onlineEnabled && !doctor.clinics.length) throw new BadRequestException('Select an active clinic or enable online consultation');
    if (doctor.documents.some((document) => !document.uploadedAt)) throw new BadRequestException('Complete every document upload before submission');
    const requiredDocuments = ['MEDICAL_REGISTRATION', 'QUALIFICATION', 'GOVERNMENT_ID'];
    if (requiredDocuments.some((type) => !doctor.documents.some((document) => document.type === type && document.uploadedAt))) {
      throw new BadRequestException('Medical registration, qualification proof, and government ID are required');
    }
    return this.prisma.doctor.update({
      where: { id: doctor.id },
      data: { status: DoctorStatus.PENDING_VERIFICATION, submittedAt: new Date(), verificationNotes: null },
    });
  }

  async upsertSchedule(userId: string, scheduleId: string | undefined, dto: UpsertScheduleDto) {
    const doctor = await this.ownDoctor(userId);
    if (dto.startMinute >= dto.endMinute) throw new BadRequestException('Working start time must be before end time');
    const hasBreak = dto.breakStartMinute !== undefined || dto.breakEndMinute !== undefined;
    if (hasBreak && (dto.breakStartMinute === undefined || dto.breakEndMinute === undefined || dto.breakStartMinute >= dto.breakEndMinute)) {
      throw new BadRequestException('Both valid break times are required');
    }
    if (scheduleId) {
      const existing = await this.prisma.doctorSchedule.findUnique({ where: { id: scheduleId } });
      if (!existing || existing.doctorId !== doctor.id) throw new NotFoundException('Schedule not found');
      return this.prisma.doctorSchedule.update({ where: { id: scheduleId }, data: dto });
    }
    return this.prisma.doctorSchedule.create({ data: { doctorId: doctor.id, ...dto, active: dto.active ?? true } });
  }

  async search(query: DoctorSearchDto) {
    const dayOfWeek = query.availableDate ? this.dayOfWeek(query.availableDate) : undefined;
    const where: Prisma.DoctorWhereInput = {
      status: DoctorStatus.APPROVED,
      ...(query.gender ? { gender: { equals: query.gender, mode: 'insensitive' } } : {}),
      ...(query.maxFeePaise !== undefined ? { clinicFeePaise: { lte: query.maxFeePaise } } : {}),
      ...(query.minRating !== undefined ? { averageRating: { gte: query.minRating } } : {}),
      ...(query.online ? { onlineEnabled: true } : {}),
      ...(dayOfWeek !== undefined ? { schedules: { some: { dayOfWeek, active: true } } } : {}),
      ...(query.specialty ? { specializations: { some: { specialization: { slug: query.specialty, active: true } } } } : {}),
      ...(query.area ? { clinics: { some: { clinic: { addresses: { some: { area: { contains: query.area, mode: 'insensitive' } } } } } } } : {}),
      ...(query.q ? {
        OR: [
          { user: { displayName: { contains: query.q, mode: 'insensitive' } } },
          { specializations: { some: { specialization: { nameEn: { contains: query.q, mode: 'insensitive' } } } } },
          { clinics: { some: { clinic: { name: { contains: query.q, mode: 'insensitive' } } } } },
        ],
      } : {}),
    };
    const orderBy: Prisma.DoctorOrderByWithRelationInput = query.sort === 'fee'
      ? { clinicFeePaise: 'asc' }
      : { averageRating: 'desc' };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.doctor.findMany({
        where,
        include: {
          user: { select: { displayName: true } },
          specializations: { include: { specialization: true } },
          clinics: { include: { clinic: { include: { addresses: true } } } },
        },
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.doctor.count({ where }),
    ]);
    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async publicProfile(doctorId: string) {
    const doctor = await this.prisma.doctor.findFirst({
      where: { id: doctorId, status: DoctorStatus.APPROVED },
      include: {
        user: { select: { displayName: true } },
        specializations: { include: { specialization: true } },
        clinics: { where: { active: true }, include: { clinic: { include: { addresses: true } } } },
        schedules: { where: { active: true } },
      },
    });
    if (!doctor) throw new NotFoundException('Approved doctor not found');
    return Object.fromEntries(Object.entries(doctor).filter(([key]) => !['registrationNumber', 'registrationCouncil'].includes(key)));
  }

  async availability(doctorId: string, query: AvailabilityQueryDto) {
    const doctor = await this.prisma.doctor.findFirst({ where: { id: doctorId, status: DoctorStatus.APPROVED } });
    if (!doctor) throw new NotFoundException('Approved doctor not found');
    const dayOfWeek = this.dayOfWeek(query.date);
    const schedules = await this.prisma.doctorSchedule.findMany({
      where: { doctorId, dayOfWeek, consultationType: query.type, clinicId: query.clinicId, active: true },
    });
    const dayStart = this.localMinuteToInstant(query.date, 0);
    const dayEnd = this.localMinuteToInstant(query.date, 1440);
    const now = new Date();
    const booked = await this.prisma.appointment.groupBy({
      by: ['startAt'],
      where: {
        doctorId,
        startAt: { gte: dayStart, lt: dayEnd },
        OR: [
          { status: { in: [AppointmentStatus.CONFIRMED, AppointmentStatus.CHECKED_IN] } },
          { status: AppointmentStatus.PAYMENT_PENDING, holdExpiresAt: { gt: now } },
        ],
      },
      _count: true,
    });
    const reserved = new Map(booked.map((item) => [item.startAt.toISOString(), item._count]));
    const slots = schedules.flatMap((schedule) => {
      const values: Array<{ startAt: string; endAt: string; available: boolean }> = [];
      for (let minute = schedule.startMinute; minute + schedule.slotDurationMinutes <= schedule.endMinute; minute += schedule.slotDurationMinutes) {
        const overlapsBreak = schedule.breakStartMinute !== null && schedule.breakEndMinute !== null
          && minute < schedule.breakEndMinute && minute + schedule.slotDurationMinutes > schedule.breakStartMinute;
        if (overlapsBreak) continue;
        const start = this.localMinuteToInstant(query.date, minute);
        const end = this.localMinuteToInstant(query.date, minute + schedule.slotDurationMinutes);
        values.push({
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          available: start > now && (reserved.get(start.toISOString()) ?? 0) < schedule.maxAppointmentsPerSlot,
        });
      }
      return values;
    });
    return { doctorId, date: query.date, timezone: 'Asia/Kolkata', slots };
  }

  async dashboard(userId: string) {
    const doctor = await this.ownDoctor(userId);
    const now = new Date();
    const indiaNow = new Date(now.getTime() + 330 * 60_000);
    const localDate = indiaNow.toISOString().slice(0, 10);
    const dayStart = this.localMinuteToInstant(localDate, 0);
    const dayEnd = this.localMinuteToInstant(localDate, 1440);
    const [today, upcoming, completed, earnings, schedules] = await this.prisma.$transaction([
      this.prisma.appointment.count({ where: { doctorId: doctor.id, startAt: { gte: dayStart, lt: dayEnd }, status: { in: activeStatuses } } }),
      this.prisma.appointment.count({ where: { doctorId: doctor.id, startAt: { gte: dayEnd }, status: { in: activeStatuses } } }),
      this.prisma.appointment.count({ where: { doctorId: doctor.id, status: AppointmentStatus.COMPLETED } }),
      this.prisma.appointment.aggregate({ where: { doctorId: doctor.id, status: AppointmentStatus.COMPLETED }, _sum: { consultationFeePaise: true } }),
      this.prisma.doctorSchedule.findMany({ where: { doctorId: doctor.id }, orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }] }),
    ]);
    return {
      verificationStatus: doctor.status,
      todayAppointments: today,
      upcomingAppointments: upcoming,
      completedAppointments: completed,
      grossEarningsPaise: earnings._sum.consultationFeePaise ?? 0,
      schedules,
    };
  }

  private dayOfWeek(date: string): number {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('Date must use YYYY-MM-DD');
    const parsed = new Date(`${date}T12:00:00Z`);
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException('Invalid date');
    return parsed.getUTCDay();
  }

  private localMinuteToInstant(date: string, minute: number): Date {
    const base = new Date(`${date}T00:00:00+05:30`);
    return new Date(base.getTime() + minute * 60_000);
  }
}
