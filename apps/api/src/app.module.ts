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
import { MailerModule } from './modules/mailer/mailer.module';
import { PaymentsSharedModule } from './modules/payments/payments-shared.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';

/**
 * PHASE 3: full crypto payment flow wired — invoice creation with rate lock,
 * signed webhooks (log-first, idempotent), confirmation tracking, inventory
 * allocation (FOR UPDATE SKIP LOCKED), email + on-screen delivery, edge cases.
 * Admin module arrives in PHASE 4.
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
    MailerModule,
    PaymentsSharedModule,
    PaymentsModule,
    WebhooksModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
