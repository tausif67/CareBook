import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AuthUser } from '../common/security/auth-user.js';
import { CurrentUser } from '../common/security/current-user.decorator.js';
import { Roles } from '../common/security/roles.decorator.js';
import { UpdatePatientProfileDto } from './profiles.dto.js';

@ApiTags('profiles')
@ApiBearerAuth()
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { id: true, displayName: true, phoneE164: true, email: true, role: true, locale: true, status: true, patient: true, doctor: true },
    });
  }

  @Roles(UserRole.PATIENT)
  @Patch('me/patient')
  updatePatient(@CurrentUser() user: AuthUser, @Body() dto: UpdatePatientProfileDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.sub }, data: { displayName: dto.displayName } });
      return tx.patient.update({
        where: { userId: user.sub },
        data: { dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null, gender: dto.gender },
        include: { user: true },
      });
    });
  }
}

