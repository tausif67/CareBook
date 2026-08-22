import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsEnum, IsOptional, IsPhoneNumber, IsString, Length, MaxLength, ValidateIf } from 'class-validator';

export class ExchangeOtpDto {
  @ApiPropertyOptional({ description: 'Firebase ID token returned after OTP verification' })
  @ValidateIf((value: ExchangeOtpDto) => !value.localOtp)
  @IsString()
  firebaseIdToken?: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  @ValidateIf((value: ExchangeOtpDto) => Boolean(value.localOtp))
  @IsPhoneNumber('IN')
  phone?: string;

  @ApiPropertyOptional({ description: 'Development only; disabled in production' })
  @IsOptional()
  @Length(6, 6)
  localOtp?: string;

  @ApiProperty({ enum: UserRole, description: 'ADMIN succeeds only for a pre-provisioned admin record' })
  @IsEnum(UserRole)
  role!: UserRole;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  displayName!: string;
}
