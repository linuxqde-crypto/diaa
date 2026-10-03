# KROTO Architecture (PHASE 1 baseline)

## Crypto payment flow (target design, implemented in PHASE 3)

```
checkout ──▶ RateService.getRate(coin,network)          [provider live rate]
         ──▶ Redis SETNX rate:{invoiceNo} = rate, EX 900   ← 15-min LOCK
         ──▶ Invoice row: rateUsd, cryptoAmount, rateExpiresAt, expiresAt
         ──▶ PaymentProvider.createInvoice() → address + paymentUri → QR + countdown
webhook  ──▶ verify signature (HMAC/shared secret, constant-time)
         ──▶ INSERT webhook_logs (raw payload, idempotencyKey UNIQUE)  ← replayable
         ──▶ BullMQ invoice-tracker: poll confirmations until network threshold
                BTC 3 · ETH 12 · TRON 20 · SOLANA 32 · BNB 15
on CONFIRMED ──▶ tx { mark invoice CONFIRMED + order PAID
                    SELECT id FROM inventory_codes WHERE product_id=$1 AND status='AVAILABLE'
                      ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT $qty
                    UPDATE → RESERVED → SOLD ; write audit_logs }
delivery ──▶ on-screen reveal + Resend email (+ Telegram alert) within 2 min of confirmation
edge cases:
  UNDERPAID → invoice.status=UNDERPAID, delta stored → buyer tops up or requests refund address
  OVERPAID  → overpayDelta → store credit (users.creditUsd) or provider refund
  EXPIRED   → sweeper flips PENDING→EXPIRED past expiresAt; UI offers RE-QUOTE (new invoice, requoteOfId link)
```

## Provider abstraction
`apps/api/src/payment-providers/payment-provider.interface.ts` defines the full contract
(getRate/createInvoice/getPaymentStatus/refund/verifyWebhook/parseWebhook). BTCPay Greenfield
is the default binding; NOWPayments binds by setting `PAYMENT_PROVIDER=nowpayments`.

## Processes (docker compose)
postgres 16 · redis 7 · api (NestJS :3001, OpenAPI /api/docs) · web (Next.js :3000) · caddy (:80/:443).
Queues run in-process via BullMQ against Redis (dedicated workers optional at scale).

## Data-safety invariants
1. Codes reserved ONLY on confirmed payment (never at checkout time).
2. Every financial mutation writes an immutable audit_logs row in the same transaction.
3. Webhook processing is idempotent via `webhook_logs.idempotency_key` unique constraint.
4. Money math uses Decimal(18,8)/Decimal(12,2); no floats.
