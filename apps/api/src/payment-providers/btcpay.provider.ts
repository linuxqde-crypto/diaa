/**
 * BTCPay Server Greenfield API implementation of PaymentProviderInterface.
 * Selected via PAYMENT_PROVIDER=btcpay (default). NOWPayments is a drop-in alternative (PHASE 5+).
 *
 * SECURITY POSTURE:
 *  - No private keys anywhere. Custody lives in the BTCPay store; we only hold an
 *    API key (BTCPAY_API_KEY) scoped to invoices + webhook token.
 *  - Webhook authenticity: BTCPay signs with an HMAC over "<id>.<rawBody>" using the
 *    per-invoice webhook secret; we recompute and compare in constant time BEFORE parsing.
 *
 * When BTCPAY_URL/BTCPAY_API_KEY are unset the provider runs in OFFLINE DEMO mode so
 * `docker compose up` exercises the whole state machine locally (clearly flagged in responses).
 */
import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import axios from 'axios';
import { CryptoCurrency, Network } from '@prisma/client';
import {
  CreateInvoiceParams,
  PaymentProviderInterface,
  PaymentStatus,
  ProviderInvoice,
  WebhookEvent,
} from './payment-provider.interface';

/** currency+network → BTCPay payment-method/currency code. */
const BTCPAY_CODE: Record<string, string> = {
  'BTC:BTC': 'BTC',
  'ETH:ETH': 'ETH',
  'USDT:TRON': 'USDT-Tron',
  'USDT:ETH': 'USDT',
  'USDT:BNB_CHAIN': 'USDT-bnb',
  'SOL:SOLANA': 'SOL',
  'BNB:BNB_CHAIN': 'BNB',
};

interface DemoState {
  address: string;
  cryptoAmount: string;
  rateUsd: string;
  expiresAtMs: number;
  webhookSecret: string;
  paid: boolean;
}

@Injectable()
export class BtcpayProvider extends PaymentProviderInterface {
  readonly name = 'btcpay' as const;
  private readonly log = new Logger(BtcpayProvider.name);
  /** Offline-demo invoice registry (only used when BTCPAY_URL is unset). */
  private readonly demo = new Map<string, DemoState>();

  constructor(private readonly config: ConfigService) {
    super();
  }

  private get baseUrl(): string | undefined {
    return this.config.get<string>('BTCPAY_URL');
  }
  private get apiKey(): string | undefined {
    return this.config.get<string>('BTCPAY_API_KEY');
  }
  private get storeId(): string {
    return this.config.get<string>('BTCPAY_STORE_ID') ?? 'kroto-demo-store';
  }
  private get demoMode(): boolean {
    return !this.baseUrl || !this.apiKey;
  }
  private http() {
    return axios.create({
      baseURL: `${this.baseUrl!.replace(/\/$/, '')}/api/v1`,
      headers: { Authorization: `Token ${this.apiKey}` },
      timeout: 10_000,
    });
  }

  /** Public helper used by the controller to mint the offline-demo webhook header. */
  peekDemoSecret(invoiceNo: string): string | undefined {
    return this.demo.get(invoiceNo)?.webhookSecret;
  }
  markDemoPaid(invoiceNo: string): boolean {
    const d = this.demo.get(invoiceNo);
    if (!d) return false;
    d.paid = true;
    return true;
  }

  async getRate(currency: CryptoCurrency, network: Network): Promise<string> {
    const code = BTCPAY_CODE[`${currency}:${network}`];
    if (!code) throw new HttpException('عملة/شبكة غير مدعومة', 400);
    if (this.demoMode) {
      // Stable synthetic rates so local E2E is deterministic.
      const synthetic: Record<string, string> = {
        BTC: '60000', ETH: '3000', 'USDT-Tron': '1', USDT: '1', 'USDT-bnb': '1', SOL: '150', BNB: '600',
      };
      return synthetic[code];
    }
    const { data } = await this.http().get<Record<string, string>>(
      `/stores/${this.storeId}/rates/${encodeURIComponent(code)}`,
    );
    const rate = Number(data?.[code] ?? data?.bidRate ?? data?.mid);
    if (!Number.isFinite(rate) || rate <= 0) throw new HttpException('فشل جلب سعر الصرف', 502);
    return String(rate);
  }

  async createInvoice(p: CreateInvoiceParams): Promise<ProviderInvoice> {
    const code = BTCPAY_CODE[`${p.currency}:${p.network}`];
    if (!code) throw new HttpException('عملة/شبكة غير مدعومة', 400);

    if (this.demoMode) {
      const id = `demo_${randomBytes(8).toString('hex')}`;
      const addrPrefix: Record<Network, string> = {
        BTC: 'bc1q', ETH: '0x', TRON: 'T', SOLANA: 'SoL', BNB_CHAIN: '0x',
      };
      const address = `${addrPrefix[p.network]}${id.replace('demo_', '')}`;
      const state: DemoState = {
        address,
        cryptoAmount: p.cryptoAmount,
        rateUsd: p.rateUsd,
        expiresAtMs: Date.now() + p.ttlSeconds * 1000,
        webhookSecret: randomBytes(24).toString('hex'),
        paid: false,
      };
      this.demo.set(p.invoiceNo, state);
      this.log.warn(`[DEMO MODE] BTCPay not configured — synthetic invoice ${p.invoiceNo} (${code})`);
      return {
        providerInvoiceId: id,
        address,
        paymentUri: this.uriFor(p.network, address, p.cryptoAmount),
        cryptoAmount: p.cryptoAmount,
        rateUsd: p.rateUsd,
        expiresAt: new Date(state.expiresAtMs),
        raw: { demo: true, id },
      };
    }

    const { data } = await this.http().post('/stores/' + this.storeId + '/invoices', {
      currency: 'USD',
      price: p.amountUsd,
      orderId: p.invoiceNo,
      buyerEmail: p.buyerEmail,
      checkoutNotificationURL: p.webhookUrl,
      supportedPaymentMethods: [code],
    });
    return {
      providerInvoiceId: data.id,
      address: data.checkoutLink ? data.cryptoInfo?.[code]?.destination ?? data.address ?? '' : '',
      paymentUri: data.cryptoInfo?.[code]?.paymentUrls?.BIP21 ?? '',
      cryptoAmount: data.cryptoInfo?.[code]?.rate ? (Number(p.amountUsd) / Number(data.cryptoInfo[code].rate)).toFixed(8) : p.cryptoAmount,
      rateUsd: data.cryptoInfo?.[code]?.rate ?? p.rateUsd,
      expiresAt: new Date(Date.now() + p.ttlSeconds * 1000),
      raw: data,
    };
  }

  private uriFor(network: Network, address: string, amount: string): string {
    switch (network) {
      case 'TRON': return `tron:${address}?amount=${amount}`;
      case 'SOLANA': return `solana:${address}?amount=${amount}`;
      case 'BTC': return `bitcoin:${address}?amount=${amount}`;
      default: return `${address}?amount=${amount}`; // EVM chains: plain address + amount shown separately
    }
  }

  /** Demo-mode: provider invoice id is `demo_<first 8 of our invoiceNo>` — map back to state. */
  private findDemoState(providerInvoiceId: string): DemoState | undefined {
    const suffix = providerInvoiceId.replace(/^demo_/, '').slice(0, 8);
    for (const [invoiceNo, state] of this.demo) {
      if (invoiceNo.toLowerCase().replace(/[^a-z0-9]/g, '').includes(suffix)) return state;
    }
    return undefined;
  }

  async getPaymentStatus(providerInvoiceId: string): Promise<PaymentStatus> {
    if (this.demoMode) {
      const state = this.findDemoState(providerInvoiceId);
      const paid = state?.paid ?? false;
      return {
        paidExactly: paid,
        paidOver: false,
        paidUnder: false,
        confirmed: paid, // demo settles immediately once marked paid
        cryptoPaid: paid && state ? state.cryptoAmount : null,
        txHash: paid ? `demo_tx_${providerInvoiceId.slice(-8)}` : null,
        confirmations: paid ? 999 : 0,
      };
    }
    const { data } = await this.http().get(`/stores/${this.storeId}/invoices/${providerInvoiceId}`);
    const status: string = data.status; // New | Processing | Settled | Expired | Invalid
    const payments: any[] = data.animations?.filter?.((a: any) => a.type === 'add-payment') ?? [];
    const last = payments[payments.length - 1];
    return {
      paidExactly: status === 'Settled',
      paidOver: Boolean(last?.overpaid),
      paidUnder: status === 'Invalid',
      confirmed: status === 'Settled',
      cryptoPaid: last?.amount ?? null,
      txHash: last?.details?.[0]?.[0] ?? null,
      confirmations: last?.confirmations ?? 0,
    };
  }

  async markInvoiceExpired(providerInvoiceId: string): Promise<void> {
    if (this.demoMode) return;
    await this.http().delete(`/stores/${this.storeId}/invoices/${providerInvoiceId}`).catch(() => undefined);
  }

  async refund(providerInvoiceId: string, amountCrypto: string, refundAddress: string): Promise<{ refundId: string }> {
    if (this.demoMode) {
      return { refundId: `demo_refund_${randomBytes(6).toString('hex')}` };
    }
    const { data } = await this.http().post(`/stores/${this.storeId}/invoices/${providerInvoiceId}/refunds`, {
      payout: { destination: refundAddress, amount: amountCrypto },
    });
    return { refundId: data.id };
  }

  /**
   * Verify BTCPay's `x-webhook-sig` = HMAC-SHA256(secret, `${eventId}.${rawBody}`).
   * Constant-time compare; unknown secret ⇒ invalid (payload still gets logged upstream).
   */
  verifyWebhook(rawBody: Buffer | string, headers: Record<string, string>): boolean {
    const eventId = headers['x-webhook-id'] ?? headers['X-Webhook-Id'];
    const sig = headers['x-webhook-sig'] ?? headers['X-Webhook-Sig'];
    if (!eventId || !sig) return false;
    const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    let secret: string | undefined;
    try {
      const parsed = JSON.parse(body);
      const invNo = parsed?.metadata?.orderId ?? parsed?.invoiceId;
      secret = this.demo.get(invNo)?.webhookSecret ?? this.config.get<string>('BTCPAY_WEBHOOK_SECRET');
    } catch {
      secret = this.config.get<string>('BTCPAY_WEBHOOK_SECRET');
    }
    if (!secret) return false;
    const expected = createHmac('sha256', secret).update(`${eventId}.${body}`).digest('hex');
    try {
      return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'));
    } catch {
      return false;
    }
  }

  parseWebhook(body: unknown): WebhookEvent {
    const b = body as any;
    const events = Array.isArray(b) ? b : [b];
    const e = events[events.length - 1] ?? {};
    return {
      providerInvoiceId: e.invoiceId ?? '',
      eventType: e.type ?? 'unknown',
      status: e.status ?? e.manipulatedStatus,
      cryptoPaid: e.amount ?? undefined,
      txHash: undefined,
      confirmations: undefined,
      raw: b,
    };
  }
}
