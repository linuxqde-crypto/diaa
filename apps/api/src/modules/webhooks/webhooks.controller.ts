import { Controller, Headers, HttpCode, Inject, Logger, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { PAYMENT_PROVIDER, PaymentProviderInterface } from '../../payment-providers/payment-provider.interface';
import { PaymentService } from '../payments/payment.service';

/**
 * Provider webhooks (d.): EVERY call is logged raw to webhook_logs BEFORE any processing,
 * signature verified over the RAW body first, then idempotent handling via unique event_uid.
 * Always answers 200 for well-formed requests so BTCPay doesn't hammer us on already-logged events.
 */
@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly log = new Logger(WebhooksController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly payments: PaymentService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProviderInterface,
  ) {}

  @Post('btcpay')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Webhook من BTCPay — تحقق توقيع ثم سجل خام ثم معالجة idempotent' })
  async btcpay(@Req() req: Request & { rawBody?: Buffer }, @Headers() headers: Record<string, string>) {
    const raw = req.rawBody?.toString('utf8') ?? JSON.stringify(req.body ?? {});
    const sigValid = this.provider.verifyWebhook(raw ?? '', headers);

    let parsed: ReturnType<PaymentProviderInterface['parseWebhook']> | null = null;
    if (sigValid) {
      try { parsed = this.provider.parseWebhook(JSON.parse(raw)); } catch { parsed = null; }
    }
    const eventUid = parsed?.providerInvoiceId
      ? `${parsed.providerInvoiceId}:${parsed.eventType}:${parsed.status ?? ''}`
      : null;

    // Log FIRST — replayable forensic record regardless of validity.
    let logId: string;
    try {
      const logged = await this.prisma.webhookLog.create({
        data: {
          provider: this.provider.name,
          eventType: parsed?.eventType ?? 'unverified',
          headers: this.redact(headers) as never,
          rawPayload: this.safeJson(raw) as never,
          signatureValid: sigValid,
          idempotencyKey: eventUid,
          eventUid,
        },
      });
      logId = logged.id;
    } catch (e: any) {
      if (e?.code === 'P2002') return { received: true, note: 'duplicate-event-idempotent-skip' };
      throw e;
    }
    await this.audit.log({ action: 'WEBHOOK_RECEIVED', entityType: 'webhook', entityId: logId, metadata: { eventType: parsed?.eventType ?? 'unverified', signatureValid: sigValid } });

    if (!sigValid) {
      this.log.warn(`webhook ${logId} REJECTED — bad signature`);
      await this.prisma.webhookLog.update({ where: { id: logId }, data: { processError: 'invalid-signature' } });
      return { received: true, note: 'signature-invalid' };
    }
    if (!parsed?.providerInvoiceId) {
      await this.prisma.webhookLog.update({ where: { id: logId }, data: { processError: 'unparseable' } });
      return { received: true, note: 'unparseable' };
    }

    try {
      await this.payments.handleWebhookEvent(parsed, logId);
    } catch (e) {
      this.log.error(`webhook processing failed for ${logId}: ${(e as Error).message}`);
      await this.prisma.webhookLog.update({ where: { id: logId }, data: { processError: String(e).slice(0, 500) } });
      // 200 anyway: retries handled by provider + our sweeper; prevents BTCPay retry storms.
    }
    return { received: true };
  }

  /** NOWPayments drop-in endpoint (same pipeline, different verifier once implemented). */
  @Post('nowpayments')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Webhook من NOWPayments (بديل المزوّد)' })
  async nowpayments() {
    return { received: false, note: 'NOWPayments provider not active — set PAYMENT_PROVIDER=nowpayments in PHASE 5 swap' };
  }

  private safeJson(raw: string): unknown {
    try { return JSON.parse(raw); } catch { return { unparsed: raw.slice(0, 4000) }; }
  }
  private redact(h: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(h)) {
      out[k] = /authorization|cookie|secret/i.test(k) ? '[redacted]' : String(v).slice(0, 300);
    }
    return out;
  }
}
