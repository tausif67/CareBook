import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../common/security/auth-user.js';
import { CurrentUser } from '../common/security/current-user.decorator.js';
import { NotificationsService } from './notifications.service.js';
import { RegisterDeviceTokenDto } from './notifications.dto.js';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) { return this.notifications.list(user.sub); }

  @Patch(':id/read')
  read(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.notifications.markRead(user.sub, id); }

  @Post('devices')
  registerDevice(@CurrentUser() user: AuthUser, @Body() dto: RegisterDeviceTokenDto) {
    return this.notifications.registerDevice(user.sub, dto);
  }
}
