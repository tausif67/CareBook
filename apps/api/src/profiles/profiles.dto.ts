import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePatientProfileDto {
  @IsString() @MaxLength(120) displayName!: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() @MaxLength(30) gender?: string;
}

