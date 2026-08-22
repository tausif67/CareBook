import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConsultationType } from '@prisma/client';
import { IsEnum, IsIn, IsISO8601, IsInt, IsOptional, IsPhoneNumber, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';

export enum PaymentMode {
  ONLINE = 'ONLINE',
  PAY_AT_CLINIC = 'PAY_AT_CLINIC',
}

export class CreateAppointmentDto {
  @IsUUID() doctorId!: string;
  @IsOptional() @IsUUID() clinicId?: string;
  @IsEnum(ConsultationType) consultationType!: ConsultationType;
  @ApiProperty({ example: '2026-08-25T04:30:00.000Z', description: 'UTC slot start returned by availability API' })
  @IsISO8601({ strict: true }) startAt!: string;
  @IsString() @MaxLength(120) patientName!: string;
  @IsInt() @Min(0) @Max(125) patientAge!: number;
  @IsString() @MaxLength(30) patientGender!: string;
  @IsPhoneNumber('IN') patientPhoneE164!: string;
  @IsString() @Length(3, 500) reasonForVisit!: string;
  @IsOptional() @IsString() @MaxLength(40) couponCode?: string;
  @IsEnum(PaymentMode) paymentMode!: PaymentMode;
  @ApiProperty({ description: 'A new UUID for each user booking attempt' })
  @IsUUID() idempotencyKey!: string;
}

export class AppointmentListQueryDto {
  @ApiPropertyOptional({ enum: ['upcoming', 'completed', 'cancelled'] })
  @IsOptional() @IsIn(['upcoming', 'completed', 'cancelled']) view: 'upcoming' | 'completed' | 'cancelled' = 'upcoming';
}

export class CancelAppointmentDto {
  @IsString() @Length(3, 500) reason!: string;
}

export class RescheduleAppointmentDto {
  @IsISO8601({ strict: true }) startAt!: string;
  @IsUUID() idempotencyKey!: string;
}
