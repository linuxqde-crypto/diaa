/**
 * PaymentProviderInterface — the seam between KROTO and any crypto payment processor.
 * PHASE 3 ships `BtcpayProvider` (Greenfield API) as the primary implementation;
 * `NowPaymentsProvider` is a drop-in alternative selected via PAYMENT_PROVIDER env.
 *
 * Contract rules (enforced by consumers in Phases 3–5):
 *  - Providers NEVER touch private keys; custody lives entirely with the processor.
 *  - `createInvoice` must return a unique deposit address + exact crypto amount + QR payload.
 *  - `verifyWebhook` must be constant-time and reject unsigned payloads BEFORE parsing.
 *  - All amounts are decimal strings to avoid float drift.
 */
import { CryptoCurrency, Network } from '@prisma/client';

export interface CreateInvoiceParams {
  /** Our internal invoice number, used as the provider reference. */
  orderId: string;
  invoiceNo: string;
  amountUsd: string;
  currency: CryptoCurrency;
  network: Network;
  /** Fiat->crypto rate locked by our RateService (1 <currency> = rateUsd USD). */
  rateUsd: string;
  cryptoAmount: string;
  /** Seconds until the provider-side invoice expires. */
  ttlSeconds: number;
  /** Where the provider should POST status webhooks. */
  webhookUrl: string;
  buyerEmail?: string;
}

export interface ProviderInvoice {
  providerInvoiceId: string;
  address: string;
  /** BIP21-style / chain URI encoded into the QR code, e.g. tron:<addr>?amount=<n> */
  paymentUri: string;
  cryptoAmount: string;
  rateUsd: string;
  expiresAt: Date;
  /** Raw provider response, persisted for forensics. */
  raw: unknown;
}

export interface PaymentStatus {
  paidExactly: boolean;
  paidOver: boolean;
  paidUnder: boolean;
  confirmed: boolean; // enough on-chain confirmations for settlement
  cryptoPaid: string | null;
  txHash: string | null;
  confirmations: number;
}

export interface WebhookEvent {
  providerInvoiceId: string;
  eventType: string; // e.g. "invoice_received_payment", "invoice_settled", "invoice_expired"
  status?: string;
  cryptoPaid?: string;
  txHash?: string;
  confirmations?: number;
  raw: unknown;
}

export abstract class PaymentProviderInterface {
  abstract readonly name: 'btcpay' | 'nowpayments';

  /** Live mid-market rate: returns USD value of 1 unit of `currency` on `network`. */
  abstract getRate(currency: CryptoCurrency, network: Network): Promise<string>;

  /** Create a deposit invoice; idempotency keyed on our invoiceNo. */
  abstract createInvoice(params: CreateInvoiceParams): Promise<ProviderInvoice>;

  /** Poll current payment state (used by the confirmation-tracker BullMQ flow). */
  abstract getPaymentStatus(providerInvoiceId: string): Promise<PaymentStatus>;

  /** Expire/cancel on the provider side (called when user abandons checkout). */
  abstract markInvoiceExpired(providerInvoiceId: string): Promise<void>;

  /** Initiate a partial/full refund to a buyer-supplied address (under/overpaid flows). */
  abstract refund(
    providerInvoiceId: string,
    amountCrypto: string,
    refundAddress: string,
  ): Promise<{ refundId: string }>;

  /** Constant-time signature check over the RAW request body. */
  abstract verifyWebhook(rawBody: Buffer | string, headers: Record<string, string>): boolean;

  /** Normalize a verified webhook payload into our internal event shape. */
  abstract parseWebhook(body: unknown): WebhookEvent;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
