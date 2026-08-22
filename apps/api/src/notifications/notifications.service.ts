import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { RegisterDeviceTokenDto } from './notifications.dto.js';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async markRead(userId: string, id: string) {
    const item = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!item) throw new NotFoundException('Notification not found');
    return this.prisma.notification.update({ where: { id }, data: { status: NotificationStatus.READ } });
  }

  registerDevice(userId: string, dto: RegisterDeviceTokenDto) {
    return this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      update: { userId, platform: dto.platform, active: true, lastSeenAt: new Date() },
      create: { userId, token: dto.token, platform: dto.platform },
    });
  }
}
