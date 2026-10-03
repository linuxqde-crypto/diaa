# KROTO — AI/Engineer Onboarding Guide (single source of truth)

> Read this file top-to-bottom before touching any code. It describes the **actual current state**
> of the repository (verified against `git log` + files), the invariants that must never be broken,
> and exactly what remains to build in Phases 3–5.

## 1. What KROTO is

Arabic-first (RTL) e-commerce store selling digital gift cards / game top-ups / subscriptions /
crypto vouchers. **All payments are cryptocurrency** (BTC, ETH, USDT-TRC20, USDT-ERC20, SOL, BNB).
Delivery = secret codes revealed on-screen + emailed + shown in the buyer account.

## 2. Stack & versions (as installed)

| Layer | Tech | Notes |
|---|---|---|
| Frontend | Next.js 14 App Router, React 18, TypeScript strict, TailwindCSS | `<html lang="ar" dir="rtl">`; `qrcode.react` already in package.json for Phase 3 QR page |
| Backend | NestJS 10, class-validator DTOs, @nestjs/swagger (`/api/docs`), @nestjs/throttler v5 | global prefix `api` (health excluded) |
| DB | PostgreSQL 16 via Prisma 5 | UUID PKs (`gen_random_uuid()`), money as Decimal — **never floats** |
| Cache/lock | Redis 7 via ioredis (`RedisService` wrapper with `getJson/setJson`) | rate quotes cached 60 s; Phase 3: 15-min rate locks with TTL |
| Queue | bullmq 5 installed — **not yet wired** (Phase 3: email/sweep/webhook-retry workers) |
| Payments | BTCPay Server (Greenfield) behind `PaymentProviderInterface`, swappable NOWPayments | interface file exists, no implementation yet |
| Auth deps | JWT/TOTP libs NOT yet installed (Phase 5 will add @nestjs/jwt, passport, otplib) | schema fields already exist |
| Infra | Docker Compose (postgres, redis, api, web, caddy) + GitHub Actions CI | `deploy/Caddyfile`: `/api* → api:3001`, `/ → web:3000` |

## 3. Monorepo layout (npm workspaces not used — two independent apps)

```
apps/api    NestJS backend. prisma/{schema.prisma,migrations/,seeds/seed.ts} live HERE.
apps/web    Next.js storefront+admin (currently only RTL shell: layout.tsx/page.tsx/globals.css)
deploy/     Caddyfile
scripts/    postgres-init.sql (pgcrypto,citext), backup.sh (pg_dump -Fc, 14-day rotation)
docs/       ARCHITECTURE.md (payment state machine), this guide
.github/workflows/ci.yml
```

Commands: api dev = `npm run start:dev` (in apps/api); seed = `npm run prisma:seed`;
web dev = `npm run dev` (in apps/web). Docker: `cp .env.example .env && docker compose up -d --build`
— api container auto-runs `prisma migrate deploy` + seed on boot (see compose `api.command`).

## 4. Database — models & enums (apps/api/prisma/schema.prisma, 401 lines)

Enums: `UserRole{CUSTOMER,ADMIN,SUPER_ADMIN}` (guests = User rows with `isGuest:true`) ·
`OrderStatus{PENDING,PAID,DELIVERED,CANCELLED,REFUND_REQUESTED,REFUNDED,UNDERPAID,EXPIRED}` ·
`InvoiceStatus{PENDING,PAID,UNDERPAID,OVERPAID,EXPIRED,CONFIRMED,REFUND_ISSUED}` ·
`CryptoCurrency{BTC,ETH,USDT,SOL,BNB}` · `Network{BTC,ETH,TRON,SOLANA,BNB_CHAIN}` ·
`InventoryCodeStatus{AVAILABLE,RESERVED,SOLD,VOID}` · `CouponType{PERCENT,FIXED}` · `AuditAction` (~28 values incl. ORDER_CREATED).

Models: User, RefreshToken, Category, Product, InventoryCode, Order, OrderItem, Invoice, WebhookLog,
Coupon, ProductCoupon, Setting, AuditLog. Key columns to remember:

- **InventoryCode**: `codeEncrypted` (AES-256-GCM via `CODE_ENCRYPTION_KEY`) + `codeLast4` (display-safe),
  `batchId` (CSV import grouping), `orderId` set at allocation. Partial index `(productId, createdAt)
  WHERE status='AVAILABLE'` powers the allocator.
- **Invoice**: `rateLocked`, `rateExpiresAt`, `rateUsd`, `cryptoAmount`, `paidAmount`, `txHash`,
  `confirmations`, `requiredConfirmations`, `address`, `paymentUri`, underpay/overpay deltas,
  `refundAddress`, `requoteOfId` (expired→re-quote chain).
- **WebhookLog**: raw payload JSONB, `signatureValid`, UNIQUE `idempotencyKey` → replayable + idempotent.
- **AuditLog**: BigInt bigserial, actor snapshot, metadata diff, IP. **DB trigger forbids UPDATE/DELETE**
  on audit_logs and mutation of webhook raw payloads (`forbid_mutation_of_immutable_tables()` in migration).
- **Setting**: key/value JSONB. Seeded keys include `payments.confirmations.{BTC=3,ETH=12,TRON=20,SOLANA=32,BNB_CHAIN=15}`,
  rate-lock minutes, sweep threshold, etc.

Migration: `prisma/migrations/20261004000000_init/migration.sql` (283 lines). Add new migrations with
`npx prisma migrate dev --name xxx` from apps/api.

## 5. Seed data (idempotent, `prisma/seeds/seed.ts`)

4 Arabic categories (gift-cards🎁, game-topups🎮, subscriptions📺, crypto-vouchers🪙), 10 products
(steam-usd-10/25, googleplay-usd-15, itunes-usd-20, pubg-660uc, freefire-100diamonds,
netflix-premium-month, spotify-month, binance-gift-50usdt, bitrefill-credit-25) with per-product
network hints, ~171 encrypted demo codes, SUPER_ADMIN user (`ADMIN_EMAIL`/`ADMIN_PASSWORD` env),
coupon `KROTO10` (10%, min order $10, max 1000 redemptions), all settings above.

## 6. API surface — WHAT IS ACTUALLY IMPLEMENTED (10 routes)

Global: ValidationPipe `{whitelist, forbidNonWhitelisted, transform}`, ThrottlerGuard default 100/min,
CORS credentials on, Swagger at `/api/docs`.

| Method | Path | Throttle | Status | Behavior |
|---|---|---|---|---|
| GET | `/health` | – | ✅ | liveness probe (compose healthcheck gate) |
| GET | `/api/categories` | 60/min | ✅ | active categories + product counts |
| GET | `/api/products` | 60/min | ✅ | QueryProductsDto: category slug, search, sort, pagination, public stock badges |
| GET | `/api/products/featured?limit=` | 60/min | ✅ | homepage featured (limit clamped 1..24) |
| GET | `/api/products/:slug` | 60/min | ✅ | details + similar products |
| POST | `/api/cart/validate` | 60/min | ✅ | re-prices cart from DB, checks ACTIVE + AVAILABLE count; **reserves nothing**; Arabic 400 messages |
| POST | `/api/coupons/check` | 60/min | ✅ | validates coupon vs specific cart, returns discount+totals computed server-side |
| POST | `/api/orders/guest` | **5/min** | ✅ | see flow below |
| GET | `/api/orders/track?orderNo=&email=` | 10/min | ✅ | requires BOTH (anti-enumeration); never leaks codes pre-delivery |
| GET | `/api/rates/crypto` | 30/min | ✅ | CoinGecko USD prices, Redis-cached 60 s, 503 Arabic error if feed down |

### Guest order flow (CartService.createGuestOrder — read before Phase 3!)
1. `validate(items)` → normalizeCart (dedupe/merge qty), products must exist+active, stock checked by
   `groupby` on AVAILABLE codes. 2. `evaluateCoupon` (server-side discount). 3. upsert guest User by
   lowercased email (`isGuest:true`). 4. `$transaction`: create Order(PENDING)+OrderItems(price/name
   snapshots) + increment coupon.redeemedCount. 5. append-only `auditLog ORDER_CREATED` w/ totals,
   coupon, IP, UA. Returns `{orderId, orderNo, totals, items, nextStep:'payment'}`.
**Invariant: a PENDING order does NOT reserve inventory.** Allocation happens only inside the
Phase-3 webhook confirmation handler using `SELECT ... FOR UPDATE SKIP LOCKED`.

## 7. Payment-provider seam (apps/api/src/payment-providers/payment-provider.interface.ts)

`abstract class PaymentProviderInterface` + DI token `PAYMENT_PROVIDER` (register per
`PAYMENT_PROVIDER` env: BTCPAY | NOWPAYMENTS). Types: CreateInvoiceParams, ProviderInvoice,
PaymentStatus, WebhookEvent. Planned methods: createInvoice/getInvoice/getRate/parseWebhook/verifySignature.
**No implementation exists yet — this is the first task of Phase 3.** No private keys ever in code/DB;
custody stays in BTCPay; sweep job only references `COLD_WALLET_ADDRESS` string.

## 8. Non-negotiable invariants (violating any = reject PR)

1. Codes never reserved/sold before invoice CONFIRMATION; allocator uses row locks so double-sell is impossible.
2. Underpaid/expired invoices never deliver. Overpaid → store credit or refund decision recorded.
3. Every webhook: verify signature FIRST → persist raw payload in webhook_logs → idempotent processing
   (unique idempotencyKey; duplicate delivery must be a no-op).
4. Confirmations thresholds come from `settings` table (BTC 3, ETH 12, TRON 20, SOL 32, BNB 15).
5. Rate locked 15 min in Redis TTL + persisted on Invoice (rateUsd/rateExpiresAt). Countdown UI reads expiry from DB.
6. All financial actions → audit_logs (immutable, trigger-enforced). Money always Prisma.Decimal.
7. Public endpoints must never expose code material beyond `codeLast4`; DTO validation everywhere; every route throttled.
8. UI text is Arabic-first RTL; keep English names as secondary (`nameEn`).

## 9. Remaining phases — precise TODO

**PHASE 2 — ✅ DONE (commit 79ea66f).** Storefront shipped: home (hero/categories/featured/trust),
/search + /category/[slug] (filter/sort/pagination via CatalogBrowser), /product/[slug] (purchase box +
related), /cart (localStorage CartProvider w/ hydration guard, mirrors server normalizeCart limits),
/checkout (guest email + coupon via /coupons/check → POST /orders/guest), /pay/[orderNo] bridge
(coin/network preview from /rates/crypto; invoice creation intentionally stubbed until PHASE 3),
/track (orderNo+email). Shared: providers.tsx (Header/Footer), product-card*, lib/{api,cart,types}.
All routes call same-origin /backend/* rewrite (next.config.mjs → API_INTERNAL_URL).

**PHASE 3 (payments):** BtcpayProvider + NowPaymentsProvider implementing the interface;
POST /orders/:id/invoice {currency,network} → getRate → Redis lock `invoice:rate:<orderId>` TTL 15min +
Invoice row; GET /invoices/:id (status, countdown, address, cryptoAmount, paymentUri→QR);
POST /webhooks/btcpay (raw body, sig verify, webhook_logs insert, idempotent state machine
pending→paid/underpaid/overpaid/expired, confirmations update loop); BullMQ workers: confirmation
polling fallback, inventory allocator (FOR UPDATE SKIP LOCKED), Resend email delivery, wallet sweep
job (balance > SWEEP_THRESHOLD_USD → sweep to cold address via BTCPay), webhook retry. Edge cases:
top-up prompt, refund-address capture, re-quote endpoint creating child invoice via requoteOfId.

**PHASE 4 (admin):** JWT auth module, admin CRUD (products/categories/coupons/settings), CSV inventory
import (batchId, dedupe, encrypt codes), orders/invoices live board, audit-log viewer, refunds.

**PHASE 5 (hardening):** TOTP 2FA for admin (User TOTP fields exist), refresh-token rotation
(RefreshToken model exists), stricter per-route throttles + Redis rate-lock enforcement, monitoring
(/metrics), e2e tests incl. concurrency test proving no double-sell, backup restore drill.

## 10. Known gaps / honest caveats

- `docker compose up` has never been executed end-to-end here (no Docker in sandbox); compose config validated statically only.
- E2E flows (catalog→guest order) untested against a live DB in this environment.
- apps/api/dist/ contains stale build artifacts; `apps/api/.env` may contain local dev values — never commit real secrets.
- BullMQ/ioredis present but queues unwired; frontend is an RTL shell only.
- `otpauth/@nestjs/jwt/passport` not installed yet (deliberately deferred to Phase 5).

## 11. Git history

`abb0c5d` init → `b5c5bea` PHASE 1 (structure/compose/schema/migration/seed/provider seam/CI) →
`4f444f3` PHASE 2 backend (catalog/cart/orders/rates modules, guest checkout, Redis rate cache).
