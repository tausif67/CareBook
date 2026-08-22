import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

@Injectable()
export class FirebasePushService {
  private readonly logger = new Logger(FirebasePushService.name);
  private readonly app?: App;
  readonly enabled: boolean;

  constructor(config: ConfigService) {
    this.enabled = config.get<boolean>('FCM_ENABLED', false);
    const projectId = config.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = config.get<string>('FIREBASE_CLIENT_EMAIL');
    const privateKey = config.get<string>('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n');
    if (this.enabled && projectId && clientEmail && privateKey) {
      this.app = getApps()[0] ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    }
  }

  async send(tokens: string[], input: { title: string; body: string; data: Record<string, string> }) {
    if (!this.enabled || !this.app || !tokens.length) return undefined;
    try {
      return await getMessaging(this.app).sendEachForMulticast({
        tokens: tokens.slice(0, 500),
        notification: { title: input.title, body: input.body },
        data: input.data,
        android: { priority: 'high', notification: { channelId: 'appointments' } },
      });
    } catch (error) {
      this.logger.error('FCM batch failed', error);
      throw error;
    }
  }
}

