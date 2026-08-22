import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConsultationType } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export class UpdateDoctorProfileDto {
  @IsString() @MaxLength(100) registrationNumber!: string;
  @IsString() @MaxLength(100) registrationCouncil!: string;
  @IsInt() @Min(1950) @Max(2100) registrationYear!: number;
  @IsOptional() @IsString() gender?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) qualifications!: Array<{ degree: string; institution: string; year?: number }>;
  @IsInt() @Min(0) @Max(80) experienceYears!: number;
  @IsOptional() @IsString() @MaxLength(2000) about?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) languages!: string[];
  @IsOptional() @IsString() photoUrl?: string;
  @IsInt() @Min(0) clinicFeePaise!: number;
  @IsOptional() @IsInt() @Min(0) onlineFeePaise?: number;
  @IsBoolean() onlineEnabled!: boolean;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(5) @IsUUID('4', { each: true }) specializationIds!: string[];
  @IsOptional() @IsUUID() clinicId?: string;
}

export class StartDoctorDocumentUploadDto {
  @IsIn(['MEDICAL_REGISTRATION', 'QUALIFICATION', 'GOVERNMENT_ID', 'CLINIC_PROOF']) type!: string;
  @IsString() @MaxLength(200) fileName!: string;
  @IsIn(['application/pdf', 'image/jpeg', 'image/png']) contentType!: string;
  @IsInt() @Min(1) @Max(10_485_760) sizeBytes!: number;
  @Matches(/^[a-f0-9]{64}$/i) sha256!: string;
}

export class UpsertScheduleDto {
  @ApiProperty({ minimum: 0, maximum: 6 })
  @IsInt() @Min(0) @Max(6) dayOfWeek!: number;
  @IsOptional() @IsUUID() clinicId?: string;
  @IsInt() @Min(0) @Max(1439) startMinute!: number;
  @IsInt() @Min(1) @Max(1440) endMinute!: number;
  @IsOptional() @IsInt() @Min(0) @Max(1439) breakStartMinute?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1440) breakEndMinute?: number;
  @IsInt() @Min(5) @Max(240) slotDurationMinutes!: number;
  @IsInt() @Min(1) @Max(20) maxAppointmentsPerSlot!: number;
  @IsEnum(ConsultationType) consultationType!: ConsultationType;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class DoctorSearchDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsString() specialty?: string;
  @IsOptional() @IsString() area?: string;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxFeePaise?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minRating?: number;
  @IsOptional() @Type(() => Boolean) @IsBoolean() online?: boolean;
  @IsOptional() @IsString() availableDate?: string;
  @IsOptional() @IsIn(['recommended', 'rating', 'fee']) sort: 'recommended' | 'rating' | 'fee' = 'recommended';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize = 20;
}

export class AvailabilityQueryDto {
  @ApiProperty({ example: '2026-08-25' })
  @IsString() date!: string;
  @IsEnum(ConsultationType) type!: ConsultationType;
  @IsOptional() @IsUUID() clinicId?: string;
}
