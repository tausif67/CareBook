import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { RazorpayClient } from './razorpay.client.js';
import { RefundProcessor } from './refund.processor.js';

@Module({ controllers: [PaymentsController], providers: [PaymentsService, RazorpayClient, RefundProcessor], exports: [RefundProcessor] })
export class PaymentsModule {}
