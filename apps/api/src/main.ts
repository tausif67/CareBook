import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import pinoHttp from 'pino-http';
import { AppModule } from './app.module.js';
import { ApiExceptionFilter } from './common/errors/http-exception.filter.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
  app.enableCors({
    origin: config.getOrThrow<string>('ADMIN_WEB_ORIGIN').split(',').map((origin) => origin.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(pinoHttp({
    level: config.get<string>('LOG_LEVEL', 'info'),
    genReqId: (request, response) => {
      const supplied = request.headers['x-request-id'];
      const requestId = typeof supplied === 'string' && /^[A-Za-z0-9._:-]{1,100}$/.test(supplied) ? supplied : randomUUID();
      response.setHeader('x-request-id', requestId);
      return requestId;
    },
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'],
      censor: '[REDACTED]',
    },
  }));
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  app.useGlobalFilters(new ApiExceptionFilter());

  const openApi = new DocumentBuilder()
    .setTitle('CareBook API')
    .setDescription('Versioned API for the CareBook patient, doctor, and admin applications')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, openApi), {
    jsonDocumentUrl: 'api/docs/openapi.json',
    swaggerOptions: { persistAuthorization: true },
  });

  await app.listen(config.get<number>('PORT', 4000), '0.0.0.0');
}

void bootstrap();
