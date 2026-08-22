import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/security/public.decorator.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { RedisService } from '../common/redis/redis.service.js';
import { Specialization } from '@prisma/client';

@ApiTags('directory')
@Public()
@Controller()
export class DirectoryController {
  constructor(private readonly prisma: PrismaService, private readonly cache: RedisService) {}

  @Get('specializations')
  async specializations() {
    const key = 'directory:specializations:v1';
    const cached = await this.cache.getJson<Specialization[]>(key);
    if (cached) return cached;
    const items = await this.prisma.specialization.findMany({ where: { active: true }, orderBy: { nameEn: 'asc' } });
    await this.cache.setJson(key, items, 300);
    return items;
  }

  @Get('clinics')
  clinics(@Query('area') area?: string) {
    return this.prisma.clinic.findMany({
      where: { active: true, ...(area ? { addresses: { some: { area: { contains: area, mode: 'insensitive' } } } } : {}) },
      include: { addresses: true, _count: { select: { doctors: true } } },
      orderBy: { name: 'asc' },
      take: 100,
    });
  }
}
