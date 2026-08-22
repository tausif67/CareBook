import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { FirebaseTokenService } from './firebase-token.service.js';

@Module({ controllers: [AuthController], providers: [AuthService, FirebaseTokenService] })
export class AuthModule {}

