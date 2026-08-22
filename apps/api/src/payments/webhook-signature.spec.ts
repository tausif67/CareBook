import { createHmac, randomBytes } from 'node:crypto';
import { verifyRazorpayWebhookSignature } from './webhook-signature.js';

describe('verifyRazorpayWebhookSignature', () => {
  const body = Buffer.from('{"event":"payment.captured"}');
  const secret = randomBytes(32).toString('hex');

  it('accepts an exact HMAC of the raw bytes', () => {
    const signature = createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyRazorpayWebhookSignature(body, signature, secret)).toBe(true);
  });

  it('rejects changed content', () => {
    const signature = createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyRazorpayWebhookSignature(Buffer.from('{}'), signature, secret)).toBe(false);
  });
});
