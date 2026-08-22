import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module.js';
import { AppointmentsModule } from './appointments/appointments.module.js';
import { AuthModule } from './auth/auth.module.js';
import { envSchema } from './common/config/env.schema.js';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { RedisModule } from './common/redis/redis.module.js';
import { ObjectStorageModule } from './common/storage/object-storage.module.js';
import { JwtAuthGuard } from './common/security/jwt-auth.guard.js';
import { RolesGuard } from './common/security/roles.guard.js';
import { DirectoryModule } from './directory/directory.module.js';
import { DoctorsModule } from './doctors/doctors.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { ProfilesModule } from './profiles/profiles.module.js';
import { ReviewsModule } from './reviews/reviews.module.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema, cache: true }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_ACCESS_TTL', '15m') as never, issuer: 'carebook-api', audience: 'carebook-apps' },
        verifyOptions: { issuer: 'carebook-api', audience: 'carebook-apps' },
      }),
    }),
    PrismaModule,
    RedisModule,
    ObjectStorageModule,
    HealthModule,
    AuthModule,
    ProfilesModule,
    DirectoryModule,
    DoctorsModule,
    AppointmentsModule,
    PaymentsModule,
    NotificationsModule,
    ReviewsModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
