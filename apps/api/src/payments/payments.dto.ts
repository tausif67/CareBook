import { IsUUID } from 'class-validator';

export class CreatePaymentOrderDto {
  @IsUUID() appointmentId!: string;
}

export interface RazorpayWebhookPaymentEntity {
  id: string;
  order_id: string;
  amount: number;
  method?: string;
  error_code?: string;
  error_description?: string;
}

export interface RazorpayWebhookPayload {
  event: string;
  payload: { payment?: { entity: RazorpayWebhookPaymentEntity } };
}
