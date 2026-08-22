import { Body, Controller, Headers, Post, RawBodyRequest, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { AuthUser } from '../common/security/auth-user.js';
import { CurrentUser } from '../common/security/current-user.decorator.js';
import { Public } from '../common/security/public.decorator.js';
import { Roles } from '../common/security/roles.decorator.js';
import { CreatePaymentOrderDto } from './payments.dto.js';
import { PaymentsService } from './payments.service.js';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @ApiBearerAuth() @Roles(UserRole.PATIENT) @Post('orders')
  createOrder(@CurrentUser() user: AuthUser, @Body() dto: CreatePaymentOrderDto) {
    return this.payments.createOrder(user, dto.appointmentId);
  }

  @ApiBearerAuth() @Roles(UserRole.PATIENT) @Post('test/confirm')
  confirmTestPayment(@CurrentUser() user: AuthUser, @Body() dto: CreatePaymentOrderDto) {
    return this.payments.confirmTestPayment(user, dto.appointmentId);
  }

  @Public() @Post('webhooks/razorpay')
  webhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature?: string,
    @Headers('x-razorpay-event-id') eventId?: string,
  ) {
    if (!request.rawBody) throw new Error('Raw request body is unavailable');
    return this.payments.handleWebhook(request.rawBody, signature, eventId);
  }
}
