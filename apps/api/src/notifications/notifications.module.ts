import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { OutboxProcessor } from './outbox.processor.js';
import { FirebasePushService } from './firebase-push.service.js';

@Module({ controllers: [NotificationsController], providers: [NotificationsService, OutboxProcessor, FirebasePushService], exports: [OutboxProcessor] })
export class NotificationsModule {}
