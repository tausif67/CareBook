import { Module } from '@nestjs/common';
import { ProfilesController } from './profiles.controller.js';

@Module({ controllers: [ProfilesController] })
export class ProfilesModule {}

