import { Controller, Get } from '@nestjs/common';
import { Public } from './common/security/public.decorator.js';

@Controller()
export class AppController {
  @Public()
  @Get('health')
  health() { return { status: 'ok', service: 'carebook-api', timestamp: new Date().toISOString() }; }
}

