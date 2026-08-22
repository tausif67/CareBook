import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

@Injectable()
export class FirebaseTokenService {
  private readonly app?: App;

  constructor(private readonly config: ConfigService) {
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL');
    const privateKey = this.config.get<string>('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n');
    if (projectId && clientEmail && privateKey) {
      this.app = getApps()[0] ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    }
  }

  async verify(idToken: string): Promise<{ uid: string; phone: string }> {
    if (!this.app) throw new UnauthorizedException('OTP verification provider is not configured');
    const token = await getAuth(this.app).verifyIdToken(idToken, true);
    if (!token.phone_number) throw new UnauthorizedException('Verified mobile number is required');
    return { uid: token.uid, phone: token.phone_number };
  }
}

