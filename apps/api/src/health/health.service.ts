import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { RedisService } from '../common/redis/redis.service.js';

interface DependencyStatus {
  status: 'up' | 'down';
  latencyMs: number;
}

export interface ReadinessResponse {
  status: 'ready' | 'not_ready';
  service: 'carebook-api';
  timestamp: string;
  dependencies: {
    postgresql: DependencyStatus;
    redis: DependencyStatus;
  };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  liveness() {
    return {
      status: 'ok' as const,
      service: 'carebook-api' as const,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  async readiness(): Promise<ReadinessResponse> {
    const [postgresql, redis] = await Promise.all([
      this.check(() => this.prisma.$queryRaw`SELECT 1`),
      this.check(() => this.redis.ping()),
    ]);
    const ready = postgresql.status === 'up' && redis.status === 'up';
    const response: ReadinessResponse = {
      status: ready ? 'ready' : 'not_ready',
      service: 'carebook-api',
      timestamp: new Date().toISOString(),
      dependencies: { postgresql, redis },
    };
    if (!ready) {
      throw new ServiceUnavailableException({
        message: 'A critical dependency is unavailable',
        details: response,
      });
    }
    return response;
  }

  private async check(operation: () => Promise<unknown>): Promise<DependencyStatus> {
    const startedAt = performance.now();
    try {
      await operation();
      return { status: 'up', latencyMs: Math.max(0, Math.round(performance.now() - startedAt)) };
    } catch {
      return { status: 'down', latencyMs: Math.max(0, Math.round(performance.now() - startedAt)) };
    }
  }
}
