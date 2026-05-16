import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import multipart from '@fastify/multipart';
import { ApiExceptionFilter } from './shared/api-exception.filter.js';
import { TransformInterceptor } from './shared/transform.interceptor.js';

async function bootstrap() {
  const { AppModule } = await import('./app.module.js');
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  await app.register(multipart);
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: true,
    credentials: true
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false
    })
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  const port = Number(process.env.PORT || 3400);
  await app.listen(port, '0.0.0.0');
}

bootstrap();
