import { Module } from '@nestjs/common';
import { AppointmentIdService } from './appointment-id.service.js';
import { AppointmentsController } from './appointments.controller.js';
import { AppointmentsService } from './appointments.service.js';
import { FeeService } from './fee.service.js';

@Module({
  controllers: [AppointmentsController],
  providers: [AppointmentsService, FeeService, AppointmentIdService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}

