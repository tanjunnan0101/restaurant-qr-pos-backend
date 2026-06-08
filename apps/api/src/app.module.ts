import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { z } from 'zod';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';
import { CompaniesModule } from './companies/companies.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { MenusModule } from './menus/menus.module';
import { OrdersModule } from './orders/orders.module';
import { OutletsModule } from './outlets/outlets.module';
import { PaymentSettingsModule } from './payment-settings/payment-settings.module';
import { PaymentsModule } from './payments/payments.module';
import { PlatformModule } from './platform/platform.module';
import { PrintingModule } from './printing/printing.module';
import { RealtimeModule } from './realtime/realtime.module';
import { TablesModule } from './tables/tables.module';
import { TenantModule } from './tenant/tenant.module';

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  API_CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://localhost:3002'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(3600),
  PLATFORM_ADMIN_API_KEY: z.string().min(32),
  OWNER_APP_BASE_URL: z.string().url().default('http://localhost:3002'),
  CUSTOMER_APP_BASE_URL: z.string().url().default('http://localhost:3000'),
  ONBOARDING_TOKEN_TTL_HOURS: z.coerce.number().int().positive().default(72),
  HITPAY_API_KEY: z.string().default(''),
  HITPAY_WEBHOOK_SALT: z.string().default(''),
  HITPAY_API_URL: z.string().url().default('https://api.sandbox.hit-pay.com'),
});

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['../../.env', '.env'],
      isGlobal: true,
      cache: true,
      validate: (config: Record<string, unknown>) =>
        environmentSchema.parse(config),
    }),
    DatabaseModule,
    InfrastructureModule,
    RealtimeModule,
    TenantModule,
    AuthModule,
    CompaniesModule,
    OutletsModule,
    PaymentSettingsModule,
    MenusModule,
    TablesModule,
    OrdersModule,
    PaymentsModule,
    PrintingModule,
    PlatformModule,
    HealthModule,
  ],
  providers: [
    RequestIdMiddleware,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule {
  configure(consumer: import('@nestjs/common').MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
