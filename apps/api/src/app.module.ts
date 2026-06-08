import { MiddlewareConsumer, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { z } from 'zod';
import { AuditModule } from './audit/audit.module';
import { AttendanceModule } from './attendance/attendance.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';
import { CompaniesModule } from './companies/companies.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { RequestLoggingMiddleware } from './common/middleware/request-logging.middleware';
import { RateLimitMiddleware } from './common/middleware/rate-limit.middleware';
import { ErrorTrackingService } from './common/observability/error-tracking.service';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { InventoryModule } from './inventory/inventory.module';
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
import { UsersModule } from './users/users.module';

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  API_CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://localhost:3002'),
  API_TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  SWAGGER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
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
  RATE_LIMIT_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  RATE_LIMIT_AUTH_WINDOW_MS: z.coerce.number().int().positive().default(300000),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_PUBLIC_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60000),
  RATE_LIMIT_PUBLIC_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_ADMIN_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60000),
  RATE_LIMIT_ADMIN_MAX: z.coerce.number().int().positive().default(300),
  REQUEST_LOGGING_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  REQUEST_LOGGING_SLOW_MS: z.coerce.number().int().positive().default(1500),
  ERROR_TRACKING_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  ERROR_WEBHOOK_URL: z.string().default(''),
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
    AuditModule,
    AttendanceModule,
    InventoryModule,
    CompaniesModule,
    OutletsModule,
    PaymentSettingsModule,
    MenusModule,
    TablesModule,
    OrdersModule,
    PaymentsModule,
    PrintingModule,
    PlatformModule,
    UsersModule,
    HealthModule,
  ],
  providers: [
    ApiExceptionFilter,
    RequestIdMiddleware,
    RequestLoggingMiddleware,
    RateLimitMiddleware,
    ErrorTrackingService,
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
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware, RequestLoggingMiddleware, RateLimitMiddleware)
      .forRoutes('*');
  }
}
