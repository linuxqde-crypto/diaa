import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma.module';
import { HealthModule } from './modules/health/health.module';

/**
 * PHASE 1 skeleton. Catalog/cart/payments/admin modules are wired in Phases 2–4.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
  ],
})
export class AppModule {}
