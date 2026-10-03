/**
 * PaymentService — the CRITICAL Phase-3 flow, exactly per blueprint:
 *  a. client picks coin+network → b. fetch live rate, LOCK 15 min (Redis TTL + DB),
 *  c. provider invoice → address + exact amount + QR + countdown → d. webhook (signature-verified)
 *  e. confirmation tracking (BTC:3 ETH:12 TRON:20 SOL:32) → f. on CONFIRMED: allocate codes
 *  (SELECT FOR UPDATE SKIP LOCKED) + email + on-screen reveal → g. underpaid/overpaid/expired edges.
 */
import {
  BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma, InvoiceStatus, CryptoCurrency, Network, OrderStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis.service';
import { SettingsService } from '../../common/settings.service';
import { AuditService } from '../../common/audit.service';
import { decryptCode } from '../../common/crypto.util';
import { PAYMENT_PROVIDER, PaymentProviderInterface } from '../../payment-providers/payment-provider.interface';
import { InventoryService } from '../inventory/inventory.service';
import { MailerService } from '../mailer/mailer.service';
import { networksFor } from '../rates/rates.service';
import { divRoundUp, sub, toBase } from './decimal.util';

export interface PublicInvoice {
  invoiceNo: string;
  status: InvoiceStatus;
  currency: CryptoCurrency;
  network: Network;
  amountUsd: string;
  rateUsd: string;
  cryptoAmount: string;
  paidAmount: string | null;
  address: string | null;
  paymentUri: string | null;
  expiresAt: string;
  rateExpiresAt: string;
  confirmations: number;
  requiredConfirmations: number;
  txHash: string | null;
  underpayDelta: string | null;
  overpayDelta: string | null;
  demoMode: boolean;
}

@Injectable()
export class PaymentService {
  private readonly log = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly inventory: InventoryService,
    private readonly mailer: MailerService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProviderInterface,
  ) {}

  // ─────────────────────────── c. CREATE INVOICE (rate lock) ───────────────────────────

  async createInvoice(params: { orderNo: string; currency: CryptoCurrency; network: Network; ip?: string }) {
    const order = await this.prisma.order.findFirst({
      where: { orderNo: params.orderNo.trim().toUpperCase() },
      include: { items: true, invoices: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!order) throw new NotFoundException('الطلب غير موجود');
    if (order.status !== OrderStatus.PENDING) throw new ConflictException('الطلب لا يقبل دفعًا جديدًا الآن');

    if (!networksFor(params.currency).includes(params.network)) {
      throw new BadRequestException('مزيج العملة/الشبكة غير مدعوم');
    }

    // Reuse an active pending invoice (same coin/network) instead of double-quoting.
    const active = order.invoices?.[0];
    if (active && active.status === InvoiceStatus.PENDING && active.expiresAt > new Date()) {
      if (active.currency === params.currency && active.network === params.network) {
        return this.toClientView(active); // token already lives in the buyer's sessionStorage
      }
      await this.expireInvoice(active.id, 'requote:coin-switch'); // user switched coin → expire old quote
    }

    // b. live rate → locked for N minutes (settings.payments.rate_lock_minutes, default 15)
    const rateUsd = await this.provider.getRate(params.currency, params.network);
    const lockMinutes = await this.settings.number('payments.rate_lock_minutes', 15);
    const ttlSeconds = Math.max(60, lockMinutes * 60);
    const now = Date.now();
    const rateExpiresAt = new Date(now + ttlSeconds * 1000);
    const amountUsd = order.totalUsd.toFixed(2);
    const cryptoAmount = divRoundUp(amountUsd, rateUsd);

    const invoiceNo = `INV-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`;
    const access = randomBytes(24);
    const tokenHash = createHash('sha256').update(access).digest('hex');
    const token = access.toString('base64url');

    const webhookUrl = `${this.config.get<string>('PUBLIC_WEB_URL') ?? 'http://localhost'}/api/webhooks/btcpay`;

    // c. provider invoice (idempotent on invoiceNo)
    const prov = await this.provider.createInvoice({
      orderId: order.id,
      invoiceNo,
      amountUsd,
      currency: params.currency,
      network: params.network,
      rateUsd,
      cryptoAmount,
      ttlSeconds,
      webhookUrl,
      buyerEmail: order.email,
    });

    const requiredConfirmations = await this.settings.number(
      `payments.confirmations.${params.network}`,
      DEFAULT_CONFS[params.network],
    );

    const invoice = await this.prisma.invoice.create({
      data: {
        invoiceNo,
        orderId: order.id,
        status: InvoiceStatus.PENDING,
        currency: params.currency,
        network: params.network,
        provider: this.provider.name,
        providerInvoiceId: prov.providerInvoiceId,
        amountUsd: new Prisma.Decimal(amountUsd),
        rateUsd: new Prisma.Decimal(prov.rateUsd || rateUsd),
        cryptoAmount: new Prisma.Decimal(prov.cryptoAmount || cryptoAmount),
        rateLocked: true,
        rateExpiresAt,
        address: prov.address,
        paymentUri: prov.paymentUri,
        requiredConfirmations,
        expiresAt: prov.expiresAt ?? rateExpiresAt,
        requoteOfId: active?.id ?? null,
        accessTokens: {
          create: { tokenHash, invoiceNo, expiresAt: rateExpiresAt },
        },
      },
      include: { accessTokens: true },
    });

    // Redis mirror of the lock (TTL) so expiry sweeps are cheap and crash-safe.
    await this.redisSet(`invoicerlock:${invoice.id}`, JSON.stringify({ rateUsd, cryptoAmount, expiresAt: rateExpiresAt.toISOString() }), ttlSeconds);

    await this.audit.log({
      action: 'INVOICE_CREATED', entityType: 'invoice', entityId: invoice.id, actorEmail: order.email,
      metadata: { invoiceNo, orderNo: order.orderNo, currency: params.currency, network: params.network, amountUsd, rateUsd, cryptoAmount, requoteOf: active?.invoiceNo ?? null },
      ip: params.ip,
    });
    await this.audit.log({
      action: 'RATE_LOCKED', entityType: 'invoice', entityId: invoice.id, actorEmail: order.email,
      metadata: { rateUsd, lockedUntil: rateExpiresAt.toISOString(), minutes: lockMinutes },
    });

    return this.toClientView(invoice, token);
  }

  // ─────────────────────── read endpoints (token-gated) ───────────────────────

  async getInvoiceByToken(invoiceNo: string, token: string): Promise<PublicInvoice> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { invoiceNo: invoiceNo.toUpperCase() },
      include: { accessTokens: true },
    });
    if (!invoice) throw new NotFoundException('الفاتورة غير موجودة');
    const hash = createHash('sha256').update(token).digest('hex');
    if (!invoice.accessTokens.some((t) => t.tokenHash === hash && t.expiresAt > new Date())) {
      throw new ForbiddenException('رمز الوصول غير صالح أو منتهي');
    }
    return this.toClientView(invoice);
  }

  /** Polling endpoint for the UI countdown/confirmation progress (also runs the lazy expiry sweep). */
  async statusForToken(invoiceNo: string, token: string) {
    const inv = await this.getInvoiceByToken(invoiceNo, token);
    return inv;
  }

  // ─────────────────────── d/e. WEBHOOK PROCESSING (idempotent) ───────────────────────

  /** Called by WebhookController AFTER signature verification & raw logging. Returns processed log id. */
  async handleWebhookEvent(event: ReturnType<PaymentProviderInterface['parseWebhook']>, logId: string): Promise<void> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { OR: [{ providerInvoiceId: event.providerInvoiceId }, { invoiceNo: (event.raw as any)?.metadata?.orderId ?? '' }] },
      include: { order: { include: { items: true } } },
    });
    if (!invoice) throw new NotFoundException('invoice for webhook not found');

    await this.prisma.webhookLog.update({ where: { id: logId }, data: { invoiceId: invoice.id, processed: true } });

    const type = (event.eventType ?? '').toLowerCase();
    const status = (event.status ?? '').toLowerCase();

    if (type.includes('expired') || status === 'expired') {
      await this.expireInvoice(invoice.id, 'webhook-expired');
      return;
    }

    // Pull authoritative state from the provider (confirmations per network).
    const ps = await this.provider.getPaymentStatus(invoice.providerInvoiceId ?? event.providerInvoiceId);
    const required = invoice.requiredConfirmations;
    const confs = Math.min(ps.confirmations, required);
    const paidStr = ps.cryptoPaid ?? '0';
    const target = invoice.cryptoAmount.toFixed(8);

    const delta = (() => {
      try {
        return toBase(paidStr) - toBase(target);
      } catch {
        return -1n;
      }
    })();

    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        paidAmount: new Prisma.Decimal(paidStr || '0'),
        confirmations: confs,
        txHash: ps.txHash ?? invoice.txHash,
      },
    });

    if (delta < 0n && toBase(paidStr) > 0n) {
      // UNDERPAID edge (g): store partial observation, keep PENDING until top-up or expiry.
      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: InvoiceStatus.UNDERPAID, underpayDelta: new Prisma.Decimal(sub(target, paidStr)) },
      });
      await this.audit.log({
        action: 'PAYMENT_UNDERPAID', entityType: 'invoice', entityId: invoice.id, actorEmail: invoice.order.email,
        metadata: { invoiceNo: invoice.invoiceNo, expected: target, received: paidStr, shortBy: sub(target, paidStr) },
      });
      return;
    }

    if (delta > 0n) {
      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: { overpayDelta: new Prisma.Decimal(sub(paidStr, target)) },
      });
      await this.audit.log({
        action: 'PAYMENT_OVERPAID', entityType: 'invoice', entityId: invoice.id, actorEmail: invoice.order.email,
        metadata: { invoiceNo: invoice.invoiceNo, overpaidBy: sub(paidStr, target) },
      });
    }

    if (toBase(paidStr) >= toBase(target)) {
      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: InvoiceStatus.PAID },
      });
      await this.audit.log({
        action: 'PAYMENT_RECEIVED', entityType: 'invoice', entityId: invoice.id, actorEmail: invoice.order.email,
        metadata: { invoiceNo: invoice.invoiceNo, paid: paidStr, confirmations: ps.confirmations, txHash: ps.txHash },
      });
    }

    // e→f. enough confirmations → settle + fulfill (idempotent via status guard inside tx)
    if ((ps.confirmed || ps.confirmations >= required) && toBase(paidStr) >= toBase(target)) {
      await this.settleAndFulfill(invoice.id);
    }
  }

  /** Demo-mode helper: mint a signed webhook payload for an invoice (offline E2E only). */
  buildDemoWebhookPayload(invoiceNo: string): { body: unknown; headers: Record<string, string> } | null {
    const p = this.provider as unknown as { peekDemoSecret?: (n: string) => string | undefined };
    const secret = typeof p.peekDemoSecret === 'function' ? p.peekDemoSecret(invoiceNo) : undefined;
    if (!secret) return null;
    const eventId = randomBytes(12).toString('hex');
    const body = { invoiceId: `demo_${invoiceNo.slice(-8).toLowerCase()}`, type: 'invoice_settled', status: 'settled', metadata: { orderId: invoiceNo } };
    const { createHmac } = require('node:crypto') as typeof import('node:crypto');
    const sig = createHmac('sha256', secret).update(`${eventId}.${JSON.stringify(body)}`).digest('hex');
    return { body, headers: { 'x-webhook-id': eventId, 'x-webhook-sig': sig } };
  }

  markDemoPaid(invoiceNo: string): boolean {
    const p = this.provider as unknown as { markDemoPaid?: (n: string) => boolean };
    return typeof p.markDemoPaid === 'function' ? p.markDemoPaid(invoiceNo) : false;
  }

  /** Demo E2E: verify the caller holds the access token, simulate on-chain settlement, then run the REAL webhook pipeline. */
  async markDemoPaidAndNotify(invoiceNo: string, token: string): Promise<boolean> {
    if (!this.config.get<string>('BTCPAY_URL')) {
      // token check happens via getInvoiceByToken (throws 403/404 if invalid)
      await this.getInvoiceByToken(invoiceNo, token);
      if (!this.markDemoPaid(invoiceNo.toUpperCase())) return false;
      const hook = this.buildDemoWebhookPayload(invoiceNo.toUpperCase());
      if (!hook) return false;
      await this.simulateWebhook(hook.body, hook.headers);
      return true;
    }
    return false; // real mode: only BTCPay may notify us
  }

  /** Runs the same log→verify→idempotent-process pipeline as a live HTTP webhook (demo + PHASE-5 replay tooling). */
  async simulateWebhook(body: unknown, headers: Record<string, string>): Promise<{ ok: boolean; reason?: string }> {
    const raw = JSON.stringify(body);
    const valid = this.provider.verifyWebhook(raw, headers);
    const parsed = valid ? this.provider.parseWebhook(body) : null;
    const eventUid = parsed?.providerInvoiceId
      ? `${parsed.providerInvoiceId}:${parsed.eventType}:${(body as any)?.status ?? ''}`
      : null;

    let logId: string;
    try {
      const logged = await this.prisma.webhookLog.create({
        data: {
          provider: this.provider.name,
          eventType: parsed?.eventType ?? 'unverified',
          headers: headers as Prisma.InputJsonValue,
          rawPayload: body as Prisma.InputJsonValue,
          signatureValid: valid,
          idempotencyKey: eventUid,
          eventUid,
        },
      });
      logId = logged.id;
    } catch (e) {
      if ((e as Prisma.PrismaClientKnownRequestError)?.code === 'P2002') {
        return { ok: true, reason: 'duplicate-event-idempotent-skip' }; // replay → no-op success
      }
      throw e;
    }
    await this.audit.log({ action: 'WEBHOOK_RECEIVED', entityType: 'webhook', entityId: logId, metadata: { eventType: parsed?.eventType, signatureValid: valid } });
    if (!valid) return { ok: false, reason: 'invalid-signature' };
    if (!parsed?.providerInvoiceId) return { ok: false, reason: 'unparseable' };
    try {
      await this.handleWebhookEvent(parsed, logId);
    } catch (e) {
      await this.prisma.webhookLog.update({ where: { id: logId }, data: { processError: String(e).slice(0, 500) } });
      return { ok: false, reason: 'processing-error' };
    }
    return { ok: true };
  }

  // ─────────────────────── f. SETTLE + FULFILL (atomic) ───────────────────────

  /** Idempotent: safe to call from webhook AND poll-sweep; second caller no-ops. */
  async settleAndFulfill(invoiceId: string): Promise<{ delivered: boolean }> {
    const result = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { order: { include: { items: true } } } });
      if (!inv) throw new NotFoundException();
      if (inv.status === InvoiceStatus.CONFIRMED) return { delivered: false, already: true, orderNo: inv.order.orderNo };
      if (inv.status !== InvoiceStatus.PAID && inv.status !== InvoiceStatus.OVERPAID && !(inv.status === InvoiceStatus.UNDERPAID)) {
        // expired/pending invoices NEVER deliver codes (acceptance criterion)
        return { delivered: false, blocked: inv.status, orderNo: inv.order.orderNo };
      }
      if (inv.expiresAt < new Date() && inv.status !== InvoiceStatus.PAID && inv.status !== InvoiceStatus.OVERPAID) {
        return { delivered: false, blocked: 'EXPIRED', orderNo: inv.order.orderNo };
      }

      await tx.invoice.update({ where: { id: inv.id }, data: { status: InvoiceStatus.CONFIRMED, settledAt: new Date() } });
      await tx.order.update({ where: { id: inv.orderId }, data: { status: OrderStatus.PAID } });

      // Allocate inventory under row locks — one batch per line item.
      for (const item of inv.order.items) {
        const ids = await this.inventory.allocateForOrder({ productId: item.productId, quantity: item.quantity, orderId: inv.orderId, tx });
        await tx.orderItem.update({ where: { id: item.id }, data: { inventoryCodeIds: ids } });
      }

      await tx.order.update({ where: { id: inv.orderId }, data: { status: OrderStatus.DELIVERED, deliveredAt: new Date() } });
      return { delivered: true, orderNo: inv.order.orderNo, orderId: inv.orderId, email: inv.order.email };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 8000, timeout: 20000 });

    if (!result.delivered) {
      if ((result as any).blocked) {
        await this.audit.log({ action: 'INVOICE_EXPIRED', entityType: 'invoice', entityId: invoiceId, metadata: { note: `fulfill blocked: ${ (result as any).blocked }` } });
      }
      return { delivered: false };
    }

    // Post-commit side effects: audit + email (email failure must NOT roll back delivery).
    const fresh = await this.prisma.order.findUniqueOrThrow({
      where: { id: (result as any).orderId },
      include: { items: true },
    });
    await this.loadPlaintexts(fresh.items.flatMap((i) => i.inventoryCodeIds));
    await this.audit.log({ action: 'ORDER_PAID', entityType: 'order', entityId: fresh.id, actorEmail: fresh.email, metadata: { orderNo: fresh.orderNo } });
    await this.audit.log({ action: 'CODE_ALLOCATED', entityType: 'order', entityId: fresh.id, actorEmail: fresh.email, metadata: { counts: fresh.items.map((i) => ({ product: i.productNameAr, n: i.inventoryCodeIds.length })) } });

    const codesByItem = fresh.items.map((i) => ({
      nameAr: i.productNameAr,
      quantity: i.quantity,
      codes: i.inventoryCodeIds.map((id) => this.plainCode(id)),
    }));
    await this.audit.log({ action: 'CODE_SOLD', entityType: 'order', entityId: fresh.id, actorEmail: fresh.email, metadata: { totalCodes: codesByItem.reduce((a, x) => a + x.codes.length, 0) } });

    const emailed = await this.mailer.sendCodeDelivery({ to: fresh.email, orderNo: fresh.orderNo, items: codesByItem, totalUsd: Number(fresh.totalUsd) });
    if (!emailed) this.log.warn(`codes delivered for ${fresh.orderNo} but email offline — reveal endpoint still serves them`);
    await this.audit.log({ action: 'ORDER_DELIVERED', entityType: 'order', entityId: fresh.id, actorEmail: fresh.email, metadata: { orderNo: fresh.orderNo, emailed } });
    return { delivered: true };
  }

  /** Decrypt one allocated code (plaintext exists only in-memory during delivery). */
  private plainCode(codeId: string): string {
    return this.plainCache.get(codeId) ?? '⚠️';
  }
  private plainCache = new Map<string, string>();

  /** Populate the in-memory plaintext cache for freshly-allocated codes (called right after the tx commits). */
  private async loadPlaintexts(ids: string[]): Promise<void> {
    if (!ids.length) return;
    const rows = await this.prisma.inventoryCode.findMany({ where: { id: { in: ids } }, select: { id: true, codeEncrypted: true } });
    for (const r of rows) {
      try { this.plainCache.set(r.id, decryptCode(r.codeEncrypted)); } catch { this.plainCache.set(r.id, '⚠️ كود تالف'); }
    }
    // keep the cache tiny — entries are consumed once at delivery
    setTimeout(() => ids.forEach((id) => this.plainCache.delete(id)), 60_000).unref?.();
  }

  /** On-screen reveal — requires the same secret token that was returned at invoice creation. */
  async revealCodes(orderNo: string, email: string) {
    const order = await this.prisma.order.findFirst({
      where: { orderNo: orderNo.trim().toUpperCase(), email: email.trim().toLowerCase() },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('لم يتم العثور على طلب مطابق');
    if (order.status !== OrderStatus.DELIVERED) {
      return { ready: false, status: order.status, message: 'لم يتم تأكيد الدفع بعد — الأكواد تظهر هنا فور التأكيد' };
    }
    const items: { nameAr: string; quantity: number; codes: string[] }[] = [];
    for (const it of order.items) {
      const rows = it.inventoryCodeIds.length
        ? await this.prisma.inventoryCode.findMany({ where: { id: { in: it.inventoryCodeIds } } })
        : [];
      items.push({
        nameAr: it.productNameAr,
        quantity: it.quantity,
        codes: rows.map((r) => {
          try { return decryptCode(r.codeEncrypted); } catch { return '⚠️ كود تالف'; }
        }),
      });
    }
    await this.audit.log({ action: 'ORDER_DELIVERED', entityType: 'order', entityId: order.id, actorEmail: order.email, metadata: { orderNo: order.orderNo, channel: 'reveal' } });
    return { ready: true, status: order.status, orderNo: order.orderNo, items };
  }

  // ─────────────────────── g. EDGE CASES ───────────────────────

  async expireInvoice(invoiceId: string, reason: string): Promise<void> {
    const inv = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv || inv.status === InvoiceStatus.CONFIRMED || inv.status === InvoiceStatus.EXPIRED) return;
    if (inv.status === InvoiceStatus.PAID || inv.status === InvoiceStatus.UNDERPAID || inv.status === InvoiceStatus.OVERPAID) {
      // money arrived late after expiry window — PAID stays eligible for manual settle; UNDERPAID waits for top-up
      if (inv.status === InvoiceStatus.PAID) { await this.settleAndFulfill(inv.id); return; }
      return;
    }
    await this.prisma.invoice.update({ where: { id: inv.id }, data: { status: InvoiceStatus.EXPIRED } });
    await this.provider.markInvoiceExpired(inv.providerInvoiceId ?? '').catch(() => undefined);
    await this.redisDel(`invoicerlock:${inv.id}`);
    await this.audit.log({ action: 'INVOICE_EXPIRED', entityType: 'invoice', entityId: inv.id, metadata: { invoiceNo: inv.invoiceNo, reason } });
  }

  /** Expired invoice → fresh quote (new invoice with requoteOfId link, current rate). */
  async requote(invoiceNo: string, token: string, ip?: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { invoiceNo: invoiceNo.toUpperCase() }, include: { accessTokens: true, order: true } });
    if (!inv) throw new NotFoundException();
    const hash = createHash('sha256').update(token).digest('hex');
    if (!inv.accessTokens.some((t) => t.tokenHash === hash)) throw new ForbiddenException('رمز وصول غير صالح');
    if (inv.status !== InvoiceStatus.EXPIRED && inv.status !== InvoiceStatus.PENDING) {
      throw new ConflictException('إعادة التسعير متاحة للفواتير المنتهية فقط');
    }
    await this.expireInvoice(inv.id, 'manual-requote');
    return this.createInvoice({ orderNo: inv.order.orderNo, currency: inv.currency, network: inv.network, ip });
  }

  /** Underpaid: accept a refund address so the shortfall can be returned (admin-executed in PHASE 4). */
  async submitRefundAddress(invoiceNo: string, token: string, refundAddress: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { invoiceNo: invoiceNo.toUpperCase() }, include: { accessTokens: true } });
    if (!inv) throw new NotFoundException();
    const hash = createHash('sha256').update(token).digest('hex');
    if (!inv.accessTokens.some((t) => t.tokenHash === hash)) throw new ForbiddenException('رمز وصول غير صالح');
    if (!/^.{10,120}$/.test(refundAddress)) throw new BadRequestException('عنوان استرداد غير صالح');
    await this.prisma.invoice.update({ where: { id: inv.id }, data: { refundAddress } });
    await this.audit.log({ action: 'REFUND_INITIATED', entityType: 'invoice', entityId: inv.id, metadata: { invoiceNo: inv.invoiceNo, stage: 'address-submitted', network: inv.network } });
    return { ok: true, message: 'تم حفظ عنوان الاسترداد — سيُنفَّذ خلال ساعات العمل' };
  }

  // ─────────────────────── helpers ───────────────────────

  private toClientView(
    inv: Prisma.InvoiceGetPayload<{ include: { accessTokens: true } }> | Prisma.InvoiceGetPayload<{ include: { order: { include: { items: true } } } }> | object & { invoiceNo: string; status: InvoiceStatus; [k: string]: any },
    plainToken?: string,
  ): PublicInvoice & { accessToken?: string } {
    const anyInv = inv as any;
    return {
      invoiceNo: anyInv.invoiceNo,
      status: anyInv.status,
      currency: anyInv.currency,
      network: anyInv.network,
      amountUsd: String(anyInv.amountUsd),
      rateUsd: String(anyInv.rateUsd),
      cryptoAmount: String(anyInv.cryptoAmount),
      paidAmount: anyInv.paidAmount != null ? String(anyInv.paidAmount) : null,
      address: anyInv.address,
      paymentUri: anyInv.paymentUri,
      expiresAt: anyInv.expiresAt instanceof Date ? anyInv.expiresAt.toISOString() : anyInv.expiresAt,
      rateExpiresAt: anyInv.rateExpiresAt.toISOString(),
      confirmations: anyInv.confirmations,
      requiredConfirmations: anyInv.requiredConfirmations,
      txHash: anyInv.txHash,
      underpayDelta: anyInv.underpayDelta != null ? String(anyInv.underpayDelta) : null,
      overpayDelta: anyInv.overpayDelta != null ? String(anyInv.overpayDelta) : null,
      demoMode: !this.config.get('BTCPAY_URL'),
      ...(plainToken ? { accessToken: plainToken } : {}),
    };
  }

  private async redisSet(key: string, value: string, ttlSeconds: number) {
    const c = this.redis.client;
    if (c) await c.set(key, value, 'EX', ttlSeconds).catch(() => undefined);
  }
  private async redisDel(key: string) {
    const c = this.redis.client;
    if (c) await c.del(key).catch(() => undefined);
  }
}

const DEFAULT_CONFS: Record<Network, number> = {
  BTC: 3, ETH: 12, TRON: 20, SOLANA: 32, BNB_CHAIN: 15,
};
