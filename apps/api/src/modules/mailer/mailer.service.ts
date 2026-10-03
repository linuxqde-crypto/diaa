import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface DeliveryMail {
  to: string;
  orderNo: string;
  items: { nameAr: string; quantity: number; codes: string[] }[];
  totalUsd: number;
}

/**
 * Transactional email via Resend (PHASE 6 requirement: code by email within 2 min of confirmation).
 * Graceful degradation: without RESEND_API_KEY the mail is logged (dev/docker) — delivery of the
 * order itself never depends on SMTP success (on-screen reveal + account history still work).
 */
@Injectable()
export class MailerService {
  private readonly log = new Logger(MailerService.name);

  constructor(private readonly config: ConfigService) {}

  async sendCodeDelivery(m: DeliveryMail): Promise<boolean> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    const from = this.config.get<string>('MAIL_FROM') ?? 'KROTO <codes@kroto.store>';
    const html = `
      <div dir="rtl" style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;background:#0f172a;color:#e2e8f0;border-radius:16px;padding:24px">
        <h2 style="color:#38bdf8;margin-top:0">🎁 تم تفعيل طلبك ${m.orderNo}</h2>
        <p>شكرًا لشرائك من كروتو. أكوادك جاهزة الآن:</p>
        ${m.items
          .map(
            (it) => `
          <div style="background:#1e293b;border-radius:12px;padding:14px;margin:10px 0">
            <b>${it.nameAr}${it.quantity > 1 ? ` ×${it.quantity}` : ''}</b>
            ${it.codes.map((c) => `<div dir="ltr" style="margin-top:8px;padding:10px;background:#020617;border:1px dashed #38bdf8;border-radius:8px;font-family:monospace;font-size:15px;letter-spacing:1px;text-align:center">${c}</div>`).join('')}
          </div>`,
          )
          .join('')}
        <p style="font-size:12px;color:#94a3b8">المبلغ المدفوع: $${m.totalUsd.toFixed(2)} — إن لم تكن طلبت هذا، تواصل مع الدعم فورًا.</p>
      </div>`;

    if (!apiKey || apiKey.startsWith('re_replace')) {
      this.log.warn(`[MAILER OFFLINE] Would email ${m.to} order ${m.orderNo} (${m.items.reduce((a, i) => a + i.codes.length, 0)} codes)`);
      return false;
    }
    try {
      await axios.post(
        'https://api.resend.com/emails',
        { from, to: [m.to], subject: `أكواد طلبك ${m.orderNo} — كروتو`, html },
        { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 8000 },
      );
      this.log.log(`delivery email sent → ${m.to} (${m.orderNo})`);
      return true;
    } catch (e) {
      this.log.error(`Resend failed for ${m.orderNo}: ${(e as Error).message}`);
      return false;
    }
  }
}
