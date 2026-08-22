import { Body, Controller, Get, Param, ParseEnumPipe, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DoctorStatus, UserRole } from '@prisma/client';
import { AuthUser } from '../common/security/auth-user.js';
import { CurrentUser } from '../common/security/current-user.decorator.js';
import { Roles } from '../common/security/roles.decorator.js';
import { ReviewDoctorDto, ReviewDocumentDto, SetCommissionDto } from './admin.dto.js';
import { AdminService } from './admin.service.js';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('analytics') analytics() { return this.admin.analytics(); }
  @Get('doctors') doctors(@Query('status', new ParseEnumPipe(DoctorStatus, { optional: true })) status?: DoctorStatus) { return this.admin.listDoctors(status); }
  @Patch('doctors/:id/verification') review(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewDoctorDto) {
    return this.admin.reviewDoctor(user.sub, id, dto);
  }
  @Patch('doctor-documents/:id/review') reviewDocument(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewDocumentDto) {
    return this.admin.reviewDocument(user.sub, id, dto);
  }
  @Get('doctor-documents/:id/download') documentDownload(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.documentDownload(user.sub, id);
  }
  @Get('patients') patients() { return this.admin.listPatients(); }
  @Get('appointments') appointments() { return this.admin.listAppointments(); }
  @Get('payments') payments() { return this.admin.listPayments(); }
  @Post('commission-rules') commission(@CurrentUser() user: AuthUser, @Body() dto: SetCommissionDto) { return this.admin.setCommission(user.sub, dto); }
}
