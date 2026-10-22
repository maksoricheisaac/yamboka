import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import type { Env } from './config/env';

/** Configuration partagée entre le démarrage réel et les tests e2e. */
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const origins = [
    config.get('APP_URL', { infer: true }),
    config.get('WEB_URL', { infer: true }),
  ];

  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: origins, credentials: true });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
}

export function setupSwagger(app: INestApplication): void {
  const doc = new DocumentBuilder()
    .setTitle('Yamboka API')
    .setDescription(
      'API de la plateforme Yamboka (génération vidéo et image par IA).',
    )
    .setVersion('1')
    .addCookieAuth('yamboka_session')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc));
}
