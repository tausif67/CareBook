import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthUser } from '../common/security/auth-user.js';
import { CurrentUser } from '../common/security/current-user.decorator.js';
import { Roles } from '../common/security/roles.decorator.js';
import { AppointmentListQueryDto, CancelAppointmentDto, CreateAppointmentDto, RescheduleAppointmentDto } from './appointments.dto.js';
import { AppointmentsService } from './appointments.service.js';

@ApiTags('appointments')
@ApiBearerAuth()
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Roles(UserRole.PATIENT) @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAppointmentDto) { return this.appointments.create(user, dto); }

  @Roles(UserRole.PATIENT, UserRole.DOCTOR) @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: AppointmentListQueryDto) { return this.appointments.list(user, query); }

  @Roles(UserRole.PATIENT, UserRole.DOCTOR, UserRole.ADMIN) @Post(':appointmentId/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('appointmentId', ParseUUIDPipe) appointmentId: string, @Body() dto: CancelAppointmentDto) {
    return this.appointments.cancel(user, appointmentId, dto);
  }

  @Roles(UserRole.PATIENT) @Post(':appointmentId/reschedule')
  reschedule(@CurrentUser() user: AuthUser, @Param('appointmentId', ParseUUIDPipe) appointmentId: string, @Body() dto: RescheduleAppointmentDto) {
    return this.appointments.reschedule(user, appointmentId, dto);
  }

  @Roles(UserRole.DOCTOR, UserRole.ADMIN) @Post(':appointmentId/complete')
  complete(@CurrentUser() user: AuthUser, @Param('appointmentId', ParseUUIDPipe) appointmentId: string) {
    return this.appointments.complete(user, appointmentId);
  }
}
