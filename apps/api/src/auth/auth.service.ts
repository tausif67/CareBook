import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { ExchangeOtpDto } from './auth.dto.js';
import { FirebaseTokenService } from './firebase-token.service.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly firebase: FirebaseTokenService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async exchange(dto: ExchangeOtpDto) {
    let identity: { uid?: string; phone: string };
    if (dto.firebaseIdToken) {
      identity = await this.firebase.verify(dto.firebaseIdToken);
    } else {
      const localAllowed = this.config.get<boolean>('ALLOW_LOCAL_OTP') && this.config.get('NODE_ENV') !== 'production';
      if (!localAllowed || dto.localOtp !== this.config.get('LOCAL_OTP_CODE') || !dto.phone) {
        throw new UnauthorizedException('OTP verification failed');
      }
      identity = { phone: dto.phone };
    }

    if (dto.role === UserRole.ADMIN) {
      const admin = await this.prisma.user.findFirst({
        where: { phoneE164: identity.phone, role: UserRole.ADMIN, status: 'ACTIVE', admin: { isNot: null } },
      });
      if (!admin) throw new ForbiddenException('Admin access is not provisioned for this account');
      const accessToken = await this.jwt.signAsync({ sub: admin.id, role: admin.role, phone: admin.phoneE164 });
      return { accessToken, tokenType: 'Bearer', expiresIn: this.config.get<string>('JWT_ACCESS_TTL'), user: admin };
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { phoneE164: identity.phone } });
      if (existing && existing.role !== dto.role) throw new ForbiddenException('This mobile number is registered under another role');
      const saved = await tx.user.upsert({
        where: { phoneE164: identity.phone },
        update: { displayName: dto.displayName, firebaseUid: identity.uid ?? existing?.firebaseUid },
        create: { phoneE164: identity.phone, displayName: dto.displayName, role: dto.role, firebaseUid: identity.uid },
      });
      if (dto.role === UserRole.PATIENT) await tx.patient.upsert({ where: { userId: saved.id }, update: {}, create: { userId: saved.id } });
      if (dto.role === UserRole.DOCTOR) await tx.doctor.upsert({ where: { userId: saved.id }, update: {}, create: { userId: saved.id } });
      return saved;
    });
    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role, phone: user.phoneE164 });
    return { accessToken, tokenType: 'Bearer', expiresIn: this.config.get<string>('JWT_ACCESS_TTL'), user };
  }
}
