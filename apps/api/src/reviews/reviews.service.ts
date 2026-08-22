import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AuthUser } from '../common/security/auth-user.js';
import { CreateReviewDto } from './reviews.dto.js';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthUser, dto: CreateReviewDto) {
    if (user.role !== UserRole.PATIENT) throw new ForbiddenException('Only patients can submit reviews');
    const appointment = await this.prisma.appointment.findUnique({ where: { id: dto.appointmentId }, include: { patient: true } });
    if (!appointment || appointment.patient.userId !== user.sub) throw new NotFoundException('Completed appointment not found');
    if (appointment.status !== AppointmentStatus.COMPLETED) throw new ConflictException('A review can be submitted only after a completed appointment');
    return this.prisma.$transaction(async (tx) => {
      const review = await tx.review.create({
        data: { appointmentId: appointment.id, patientId: appointment.patientId, doctorId: appointment.doctorId, rating: dto.rating, comment: dto.comment },
      });
      const stats = await tx.review.aggregate({ where: { doctorId: appointment.doctorId, visible: true }, _avg: { rating: true }, _count: true });
      await tx.doctor.update({
        where: { id: appointment.doctorId },
        data: { averageRating: new Prisma.Decimal(stats._avg.rating ?? 0), reviewCount: stats._count },
      });
      return review;
    });
  }
}

