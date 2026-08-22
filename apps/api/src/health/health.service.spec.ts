import { ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service.js';

describe('HealthService', () => {
  const prisma = { $queryRaw: jest.fn() };
  const redis = { ping: jest.fn() };
  const service = new HealthService(prisma as never, redis as never);

  beforeEach(() => jest.clearAllMocks());

  it('reports ready only when both critical dependencies respond', async () => {
    prisma.$queryRaw.mockResolvedValue([{ value: 1 }]);
    redis.ping.mockResolvedValue('PONG');

    await expect(service.readiness()).resolves.toMatchObject({
      status: 'ready',
      dependencies: { postgresql: { status: 'up' }, redis: { status: 'up' } },
    });
  });

  it('returns a service unavailable error without exposing dependency errors', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('postgresql://secret@database'));
    redis.ping.mockResolvedValue('PONG');

    await expect(service.readiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await service.readiness().catch((error: ServiceUnavailableException) => {
      const response = JSON.stringify(error.getResponse());
      expect(response).not.toContain('postgresql://');
      expect(response).toContain('not_ready');
    });
  });
});
