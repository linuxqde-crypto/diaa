# 🎁 KROTO — متجر كروتو

متجر بطاقات الهدايا الرقمي — **دفع بالكريبتو فقط** | Crypto-paid digital gift card store
(Arabic-first RTL): gift cards, game top-ups, subscriptions and crypto vouchers.

> ## 📖 Start here — full documentation index
> This README is the hub; deep-dive docs live beside it:
> - **[`docs/AGENT_GUIDE.md`](docs/AGENT_GUIDE.md)** ⭐ — *the single source of truth for any AI agent or new engineer*: exact current repo state, every implemented route, DB models, non-negotiable payment invariants, remaining TODO per phase, known gaps. Read before writing code.
> - **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** — payment-flow state machine, inventory allocator SQL (`SELECT … FOR UPDATE SKIP LOCKED`), security model.
> - **[`.env.example`](.env.example)** — every variable documented (note: no private keys by design).
> - **[`apps/api/prisma/schema.prisma`](apps/api/prisma/schema.prisma)** — canonical data model.
> - **OpenAPI** — generated at runtime: `http://localhost/api/docs` (Swagger UI).

**Stack:** Next.js 14 (App Router, TS strict) + TailwindCSS (RTL) · NestJS 10 REST ·
PostgreSQL 16 (Prisma 5) · Redis 7 (rate quotes cache → Phase-3 rate locks) · BullMQ (installed, wired in Phase 3) ·
BTCPay Server behind a `PaymentProviderInterface` (swappable with NOWPayments) · Docker Compose + Caddy · GitHub Actions CI.

## Quick start

```bash
cp .env.example .env   # fill secrets (see comments inside)
docker compose up -d --build
# storefront → http://localhost      (RTL Arabic UI — Phase 2 complete)
# API        → http://localhost/api  (catalog, cart, guest orders, rates — see table below)
# API docs   → http://localhost/api/docs
# health     → http://localhost/api/../health  (compose readiness gate)
```

On boot the `api` service runs `prisma migrate deploy` + the idempotent seed
(4 Arabic categories, 10 products, ~171 AES-encrypted demo inventory codes, super-admin user,
settings incl. per-network confirmation thresholds, `KROTO10` coupon).

### Run without Docker (dev)

```bash
cd apps/api && npm i && npx prisma migrate dev && npm run prisma:seed && npm run start:dev
cd apps/web && npm i && npm run dev          # http://localhost:3000
# requires local Postgres 16 + Redis 7 (see DATABASE_URL / REDIS_URL in .env)
```

## Implemented API surface (v0.2 — verified against source)

| Method | Route | Throttle | Purpose |
|---|---|---|---|
| GET | `/health` | – | liveness probe (DB+Redis check) |
| GET | `/api/categories` | 60/min | active categories + product counts (Arabic) |
| GET | `/api/products` | 60/min | filter by category/search/sort + pagination + public stock badges |
| GET | `/api/products/featured` | 60/min | homepage grid |
| GET | `/api/products/:slug` | 60/min | product details + similar items |
| POST | `/api/cart/validate` | 60/min | server-side re-pricing + stock check — **reserves nothing** |
| POST | `/api/coupons/check` | 60/min | coupon validation vs a specific cart |
| POST | `/api/orders/guest` | **5/min** | guest checkout: email + cart (+optional coupon) → PENDING order + audit log |
| GET | `/api/orders/track` | 10/min | orderNo **+ email** required (anti-enumeration); never leaks codes pre-delivery |
| GET | `/api/rates/crypto` | 30/min | live USD prices (CoinGecko, Redis-cached 60 s) for the coin/network picker |

All inputs validated via class-validator DTOs (`whitelist + forbidNonWhitelisted`), global rate-limit
100/min, money as `Decimal`, every financial action written to the immutable `audit_logs` table
(DB trigger blocks UPDATE/DELETE on it).

## Repository layout

```
apps/api        NestJS backend (Prisma schema/migrations/seed live here)
apps/web        Next.js 14 storefront (Phase 2 ✅ RTL Arabic: catalog/cart/checkout/track/pay-bridge) + admin panel (Phase 4)
deploy/         Caddyfile (TLS termination, /api → nest, / → next)
scripts/        postgres-init.sql (pgcrypto,citext), backup.sh (pg_dump nightly rotation)
.github/        CI: prisma validate+migrate+seed smoke test, api+web builds, compose config
docs/           AGENT_GUIDE.md (AI/engineer onboarding), ARCHITECTURE.md (payment state machine)
```

## Delivery plan status

| Phase | Scope | Status |
|---|---|---|
| 1 | Repo structure, docker-compose, Prisma schema + migration, seed | ✅ `b5c5bea` |
| 2 | Catalog API · cart validation · guest checkout · live rates · **full RTL Arabic storefront** (home/search/category/product/cart/checkout/pay-bridge/track) | ✅ `4f444f3` + `79ea66f` (`next build` clean, 9 routes) |
| 3 | Crypto payment flow: rate lock (Redis TTL), BTCPay invoices, QR + countdown, signed webhooks, confirmations (BTC 3 / ETH 12 / TRON 20 / SOL 32), delivery, under/overpay/expiry edge cases | ⏳ |
| 4 | Admin panel, CSV inventory import, audit viewer, refunds | ⏳ |
| 5 | TOTP 2FA, global rate limits, backups cron, monitoring, tests | ⏳ |

Exact per-phase TODO with file-level pointers: **[`docs/AGENT_GUIDE.md`](docs/AGENT_GUIDE.md) §9**.

## Security posture (baked into PHASE 1)

- **No private keys anywhere** — custody stays with BTCPay; sweep job only references a cold address.
- Inventory codes stored **AES-256-GCM encrypted**; only `last4` is display-safe.
- `audit_logs` & webhook raw payloads are **append-only at the DB level** (trigger-enforced).
- Row-level locking allocator (`SELECT … FOR UPDATE SKIP LOCKED`, partial index shipped in the migration) guarantees a code can never be double-sold; reservation happens **only after payment confirmation**.

## Data model (summary — canonical source: `apps/api/prisma/schema.prisma`)

**Entities:** `users` (+TOTP/refresh scaffolding, store credit) · `categories` · `products` (brand, USD
Decimal price, AR/EN copy, per-product network hints) · `inventory_codes` (`codeEncrypted` AES-256-GCM +
`codeLast4`, status `available|reserved|sold|void`, CSV-import `batchId`) · `orders` · `order_items`
(price/name snapshots) · `invoices` (rate lock fields, cryptoAmount, txHash, confirmations,
under/overpay deltas, `requoteOfId`) · `webhook_logs` (raw JSONB payload, unique idempotency key) ·
`coupons` + `product_coupons` · `settings` (key/value JSONB — confirmation thresholds, rate-lock TTL,
sweep threshold) · `audit_logs` (BigInt bigserial, append-only via DB trigger).

**Money policy:** every amount is `Decimal` (`12,2` fiat / `18,8` crypto) — floats are banned in
payments code. **UUID PKs** via `gen_random_uuid()`; citext for emails.

## Environment variables (full comments in `.env.example`)

Core: `DATABASE_URL`, `REDIS_URL`, `PORT`, `APP_BASE_URL`, `NEXT_PUBLIC_API_URL` ·
Crypto: `CODE_ENCRYPTION_KEY` (32-byte hex — encrypts inventory codes at rest) ·
Payments: `PAYMENT_PROVIDER` (`BTCPAY`|`NOWPAYMENTS`), `BTCPAY_SERVER_URL`, `BTCPAY_API_KEY`,
`BTCPAY_WEBHOOK_TOKEN`, `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET` ·
Notify: `RESEND_API_KEY`, `MAIL_FROM`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID` ·
Ops: `SWEEP_THRESHOLD_USD`, `COLD_WALLET_ADDRESS` (address string only — **never a key**),
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, TTLs, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `CADDY_EMAIL`.

## Testing & CI

GitHub Actions (`.github/workflows/ci.yml`): prisma validate → migrate deploy → seed smoke test →
`nest build` (strict TS) → `next build` → `docker compose config` lint. Unit/e2e suites arrive with
Phase 5 (including the concurrency proof that no code can be double-sold). Current verification status
and known gaps are listed honestly in **`docs/AGENT_GUIDE.md` §10**.

## Operations

- **Backups:** `scripts/backup.sh` — nightly `pg_dump -Fc`, 14-day rotation (cron-ready).
- **TLS/routing:** `deploy/Caddyfile` — auto-HTTPS, `/api* → api:3001`, `/ → web:3000`, security headers.
- **Sweeps:** hot-wallet balance > `SWEEP_THRESHOLD_USD` triggers BullMQ sweep job to cold address (Phase 3).
- **Monitoring:** `/health` probe live now; `/metrics` + Telegram alerts in Phase 5.

## How to continue this project (AI agents & humans)

1. Read [`docs/AGENT_GUIDE.md`](docs/AGENT_GUIDE.md) fully — it states exactly what exists and what's next.
2. Respect the invariants in §8 of that guide (no reservation before confirmation, signed+logged+idempotent webhooks, immutable audit, Decimal money, no private keys).
3. Pick up the next TODO from §9, implement, run `npx prisma validate` + `npm run build` in `apps/api` (and `next build` if frontend touched), then commit referencing the phase.
