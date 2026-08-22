import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { OutboxProcessor } from './notifications/outbox.processor.js';
import { RefundProcessor } from './payments/refund.processor.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const outbox = app.get(OutboxProcessor);
  const refunds = app.get(RefundProcessor);
  const run = async () => {
    try {
      await refunds.processBatch();
      await outbox.processBatch();
    } catch (error) { console.error('Worker batch failed', error); }
    setTimeout(() => void run(), 3000).unref();
  };
  await run();
}

void bootstrap();
