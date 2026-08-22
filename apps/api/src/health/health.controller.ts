import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/security/public.decorator.js';
import { HealthService } from './health.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Backward-compatible process liveness probe' })
  live() {
    return this.health.liveness();
  }

  @Public()
  @Get('live')
  @ApiOperation({ summary: 'Process liveness probe' })
  liveness() {
    return this.health.liveness();
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'PostgreSQL and Redis readiness probe' })
  readiness() {
    return this.health.readiness();
  }
}
