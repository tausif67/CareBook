import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthUser } from '../common/security/auth-user.js';
import { CurrentUser } from '../common/security/current-user.decorator.js';
import { Public } from '../common/security/public.decorator.js';
import { Roles } from '../common/security/roles.decorator.js';
import { AvailabilityQueryDto, DoctorSearchDto, StartDoctorDocumentUploadDto, UpdateDoctorProfileDto, UpsertScheduleDto } from './doctors.dto.js';
import { DoctorsService } from './doctors.service.js';

@ApiTags('doctors')
@Controller('doctors')
export class DoctorsController {
  constructor(private readonly doctors: DoctorsService) {}

  @Public() @Get()
  search(@Query() query: DoctorSearchDto) { return this.doctors.search(query); }

  @Public() @Get(':doctorId')
  profile(@Param('doctorId', ParseUUIDPipe) doctorId: string) { return this.doctors.publicProfile(doctorId); }

  @Public() @Get(':doctorId/availability')
  availability(@Param('doctorId', ParseUUIDPipe) doctorId: string, @Query() query: AvailabilityQueryDto) {
    return this.doctors.availability(doctorId, query);
  }

  @ApiBearerAuth() @Roles(UserRole.DOCTOR) @Patch('me/profile')
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateDoctorProfileDto) {
    return this.doctors.updateProfile(user.sub, dto);
  }

  @ApiBearerAuth() @Roles(UserRole.DOCTOR) @Get('me/dashboard')
  dashboard(@CurrentUser() user: AuthUser) { return this.doctors.dashboard(user.sub); }

  @ApiBearerAuth() @Roles(UserRole.DOCTOR) @Post('me/documents/upload-url')
  startDocumentUpload(@CurrentUser() user: AuthUser, @Body() dto: StartDoctorDocumentUploadDto) {
    return this.doctors.startDocumentUpload(user.sub, dto);
  }

  @ApiBearerAuth() @Roles(UserRole.DOCTOR) @Post('me/documents/:documentId/complete')
  completeDocumentUpload(@CurrentUser() user: AuthUser, @Param('documentId', ParseUUIDPipe) documentId: string) {
    return this.doctors.completeDocumentUpload(user.sub, documentId);
  }

  @ApiBearerAuth() @Roles(UserRole.DOCTOR) @Post('me/submit')
  submit(@CurrentUser() user: AuthUser) { return this.doctors.submit(user.sub); }

  @ApiBearerAuth() @Roles(UserRole.DOCTOR) @Post('me/schedules')
  createSchedule(@CurrentUser() user: AuthUser, @Body() dto: UpsertScheduleDto) {
    return this.doctors.upsertSchedule(user.sub, undefined, dto);
  }

  @ApiBearerAuth() @Roles(UserRole.DOCTOR) @Patch('me/schedules/:scheduleId')
  updateSchedule(@CurrentUser() user: AuthUser, @Param('scheduleId', ParseUUIDPipe) scheduleId: string, @Body() dto: UpsertScheduleDto) {
    return this.doctors.upsertSchedule(user.sub, scheduleId, dto);
  }
}
