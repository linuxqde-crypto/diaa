# 🎁 KROTO — متجر كروتو

Crypto-paid digital gift card store (Arabic-first RTL). Gift cards, game top-ups,
subscriptions and crypto vouchers — paid exclusively in cryptocurrency.

**Stack:** Next.js 14 (App Router) + TailwindCSS · NestJS REST (OpenAPI at `/api/docs`) ·
PostgreSQL 16 (Prisma) · Redis (rate-lock/sessions) · BullMQ · BTCPay Server behind a
`PaymentProviderInterface` (swappable with NOWPayments) · Docker Compose + Caddy · GitHub Actions CI.

## Quick start

```bash
cp .env.example .env   # fill secrets (see comments inside)
docker compose up -d --build
# storefront → http://localhost      (RTL Arabic UI)
# API docs  → http://localhost/api/docs
```

On boot the `api` service runs `prisma migrate deploy` + the idempotent seed
(categories, products, encrypted demo inventory codes, admin user, settings, coupon).

## Repository layout

```
apps/api        NestJS backend (Prisma schema/migrations/seed live here)
apps/web        Next.js 14 storefront + admin panel (PHASE 2+)
deploy/         Caddyfile (TLS termination, /api → nest, / → next)
scripts/        postgres-init.sql, backup.sh (pg_dump nightly rotation)
.github/        CI: prisma validate+migrate+seed smoke test, web build, compose config
docs/           ARCHITECTURE.md (payment flow state machine, security model)
```

## Delivery plan status

| Phase | Scope | Status |
|---|---|---|
| 1 | Repo structure, docker-compose, Prisma schema + migration, seed | ✅ this commit |
| 2 | Catalog API + RTL storefront + cart + guest checkout | ⏳ awaiting approval |
| 3 | Crypto payment flow: rate lock (Redis TTL), BTCPay invoices, QR + countdown, signed webhooks, confirmations (BTC 3 / ETH 12 / TRON 20 / SOL 32), delivery, under/overpay/expiry edge cases | ⏳ |
| 4 | Admin panel, CSV inventory import, audit viewer, refunds | ⏳ |
| 5 | TOTP 2FA, global rate limits, backups cron, monitoring, tests | ⏳ |

## Security posture (baked into PHASE 1)

- **No private keys anywhere** — custody stays with BTCPay; sweep job only references a cold address.
- Inventory codes stored **AES-256-GCM encrypted**; only `last4` is display-safe.
- `audit_logs` & webhook raw payloads are **append-only at the DB level** (trigger-enforced).
- Row-level locking allocator (`SELECT … FOR UPDATE SKIP LOCKED`, partial index shipped in the migration) guarantees a code can never be double-sold; reservation happens **only after payment confirmation**.
