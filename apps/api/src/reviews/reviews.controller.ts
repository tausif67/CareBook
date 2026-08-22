import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthUser } from '../common/security/auth-user.js';
import { CurrentUser } from '../common/security/current-user.decorator.js';
import { Roles } from '../common/security/roles.decorator.js';
import { CreateReviewDto } from './reviews.dto.js';
import { ReviewsService } from './reviews.service.js';

@ApiTags('reviews')
@ApiBearerAuth()
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}
  @Roles(UserRole.PATIENT) @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReviewDto) { return this.reviews.create(user, dto); }
}

