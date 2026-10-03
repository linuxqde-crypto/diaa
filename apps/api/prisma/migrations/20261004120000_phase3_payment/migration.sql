-- PHASE 3 schema additions:
--  1. invoice_access_tokens — hashed secret tokens gating the payment page (QR/countdown/status).
--     The plaintext token is returned ONCE at invoice creation; only its SHA-256 hash is stored.
--  2. webhook_logs.event_uid — provider event id, unique → makes webhook processing IDEMPOTENT
--     and replays detectable (every webhook stays logged & replayable per acceptance criteria).

CREATE TABLE "invoice_access_tokens" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "invoice_id" uuid NOT NULL REFERENCES "invoices"("id") ON DELETE CASCADE,
  "invoice_no" text NOT NULL,
  "token_hash" text NOT NULL UNIQUE,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "invoice_access_tokens_invoice_idx" ON "invoice_access_tokens" ("invoice_id");

ALTER TABLE "webhook_logs" ADD COLUMN "event_uid" text UNIQUE;
