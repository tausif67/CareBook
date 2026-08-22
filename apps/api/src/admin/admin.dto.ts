import { DoctorStatus, DocumentStatus } from '@prisma/client';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class ReviewDoctorDto {
  @IsIn([DoctorStatus.APPROVED, DoctorStatus.REJECTED, DoctorStatus.CORRECTION_REQUIRED, DoctorStatus.SUSPENDED])
  status!: DoctorStatus;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class SetCommissionDto {
  @IsOptional() @IsUUID() doctorId?: string;
  @IsInt() @Min(0) @Max(10000) percentageBasisPoints!: number;
  @IsInt() @Min(0) fixedPlatformFeePaise!: number;
  @IsInt() @Min(0) patientConvenienceFeePaise!: number;
}

export class ReviewDocumentDto {
  @IsIn([DocumentStatus.APPROVED, DocumentStatus.REJECTED]) status!: DocumentStatus;
  @IsOptional() @IsString() @MaxLength(1000) rejectionReason?: string;
}
