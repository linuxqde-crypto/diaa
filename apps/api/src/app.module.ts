import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './common/prisma.module';
import { RedisModule } from './common/redis.module';
import { HealthModule } from './modules/health/health.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CartModule } from './modules/cart/cart.module';
import { OrdersModule } from './modules/orders/orders.module';
import { RatesModule } from './modules/rates/rates.module';

/**
 * PHASE 2: catalog API + cart validation + guest checkout + live crypto quotes.
 * Payments/webhooks/admin modules arrive in PHASES 3–4.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Global default rate limit; stricter per-route limits via @Throttle() on controllers.
    ThrottlerModule.forRoot([{ name: 'default', limit: 100, ttl: 60_000 }]),
    PrismaModule,
    RedisModule,
    HealthModule,
    CatalogModule,
    CartModule,
    OrdersModule,
    RatesModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
