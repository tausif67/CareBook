import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

interface RazorpayRefund {
  id: string;
  amount: number;
  status: string;
}

@Injectable()
export class RazorpayClient {
  constructor(private readonly config: ConfigService) {}

  async createOrder(input: { amountPaise: number; receipt: string; idempotencyKey: string }): Promise<RazorpayOrder> {
    const keyId = this.config.get<string>('RAZORPAY_KEY_ID');
    const keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET');
    if (!keyId || !keySecret) throw new ServiceUnavailableException('Online payment gateway is not configured');
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
        'X-Razorpay-Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify({ amount: input.amountPaise, currency: 'INR', receipt: input.receipt, notes: { product: 'CareBook' } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new ServiceUnavailableException('Payment gateway could not create an order');
    return response.json() as Promise<RazorpayOrder>;
  }

  async refundPayment(input: { gatewayPaymentId: string; amountPaise: number; idempotencyKey: string }): Promise<RazorpayRefund> {
    const keyId = this.config.get<string>('RAZORPAY_KEY_ID');
    const keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET');
    if (!keyId || !keySecret) throw new ServiceUnavailableException('Online payment gateway is not configured');
    const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(input.gatewayPaymentId)}/refund`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
        'X-Razorpay-Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify({ amount: input.amountPaise, notes: { product: 'CareBook', reason: 'appointment_cancellation' } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new ServiceUnavailableException('Payment gateway could not process the refund');
    return response.json() as Promise<RazorpayRefund>;
  }
}

