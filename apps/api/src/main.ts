import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  const config = app.get(ConfigService);
  const trustProxy = config.get<boolean>('API_TRUST_PROXY') ?? true;

  if (trustProxy) {
    app.getHttpAdapter().getInstance().set('trust proxy', true);
  }

  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.enableCors({
    credentials: true,
    origin: config
      .getOrThrow<string>('API_CORS_ORIGINS')
      .split(',')
      .map((origin) => origin.trim()),
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.useGlobalFilters(app.get(ApiExceptionFilter));
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Restaurant QR POS API')
    .setDescription('Multi-tenant restaurant POS backend API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  if (config.get<boolean>('SWAGGER_ENABLED') ?? true) {
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(config.getOrThrow<number>('PORT'), '0.0.0.0');
}

void bootstrap();
