import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis(config.getOrThrow<string>('REDIS_URL'), {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    this.client.on('error', (error) => this.logger.warn(`Redis unavailable: ${error.message}`));
  }

  async ping(): Promise<string> {
    if (this.client.status === 'wait') await this.client.connect();
    return this.client.ping();
  }

  async getJson<T>(key: string): Promise<T | undefined> {
    try {
      if (this.client.status === 'wait') await this.client.connect();
      const value = await this.client.get(key);
      return value ? JSON.parse(value) as T : undefined;
    } catch { return undefined; }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      if (this.client.status === 'wait') await this.client.connect();
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch { /* Cache failure must not break authoritative database reads. */ }
  }

  async onModuleDestroy(): Promise<void> {
    if (['ready', 'connecting', 'connect'].includes(this.client.status)) await this.client.quit();
  }
}
