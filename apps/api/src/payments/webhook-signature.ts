import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyRazorpayWebhookSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const left = Buffer.from(expected, 'utf8');
  const right = Buffer.from(signature, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

