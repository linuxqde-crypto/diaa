import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { PaymentService } from './payment.service';
import { CreateInvoiceDto, InvoiceAccessDto } from './dto/invoice.dto';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentService) {}

  @Post('invoices')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'إنشاء فاتورة كريبتو: تثبيت السعر 15 دقيقة (Redis TTL + DB)، إنشاء فاتورة لدى المزوّد، إرجاع العنوان والمبلغ الدقيق ورمز وصول سري لصفحة QR/العدّاد',
  })
  async createInvoice(@Body() dto: CreateInvoiceDto, @Req() req: Request) {
    return this.payments.createInvoice({
      orderNo: dto.orderNo,
      currency: dto.currency,
      network: dto.network,
      ip: req.ip,
    });
  }

  @Get('invoices/:invoiceNo')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'حالة الفاتورة (عنوان/مبلغ/تأكيدات/انتهاء) — تتطلب رمز الوصول' })
  async status(@Param('invoiceNo') invoiceNo: string, @Query() q: InvoiceAccessDto) {
    return this.payments.statusForToken(invoiceNo, q.token);
  }

  @Post('invoices/:invoiceNo/requote')
  @Throttle({ default: { limit: 4, ttl: 60_000 } })
  @ApiOperation({ summary: 'إعادة تسعير فاتورة منتهية بسعر لحظي جديد (سجل requote مرتبط)' })
  async requote(@Param('invoiceNo') invoiceNo: string, @Body() dto: InvoiceAccessDto, @Req() req: Request) {
    return this.payments.requote(invoiceNo, dto.token, req.ip);
  }

  @Post('invoices/:invoiceNo/refund-address')
  @Throttle({ default: { limit: 4, ttl: 60_000 } })
  @ApiOperation({ summary: 'الفواتير الناقصة: حفظ عنوان استرداد للفارق (التنفيذ يدوي من لوحة الأدمن)' })
  async refundAddress(@Param('invoiceNo') invoiceNo: string, @Body() body: { token: string; refundAddress: string }, @Req() req: Request) {
    if (typeof body?.refundAddress !== 'string' || body.refundAddress.length < 10 || body.refundAddress.length > 120) {
      return { error: 'عنوان استرداد غير صالح' };
    }
    return this.payments.submitRefundAddress(invoiceNo, body.token, body.refundAddress.trim());
  }

  @Post('demo/settle')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'وضع التجربة المحلي فقط (BTCPay غير مُهيأ): يدفع المستخدم "افتراضيًا" ثم يُرسل Webhook موقَّع محليًا لتجربة الدورة كاملة',
  })
  async demoSettle(@Body() body: { invoiceNo: string; token: string }, @Req() req: Request) {
    if (typeof body?.invoiceNo !== 'string' || typeof body?.token !== 'string') {
      return { ok: false, message: 'بيانات ناقصة' };
    }
    const ok = await this.payments.markDemoPaidAndNotify(body.invoiceNo, body.token);
    return { ok, message: ok ? 'تم إرسال إشعار دفع تجريبي — حدِّث الصفحة' : 'غير متاح في الوضع الحقيقي أو فاتورة غير معروفة' };
  }

  @Post('invoices/:invoiceNo/simulate-payment')
  @Throttle({ default: { limit: 4, ttl: 60_000 } })
  @ApiOperation({ summary: 'محاكاة دفع كامل المبلغ لفاتورة تجريبية (يغذّي خط Webhook الحقيقي بنفس المسار)' })
  async simulatePayment(@Param('invoiceNo') invoiceNo: string, @Body() dto: InvoiceAccessDto) {
    const ok = await this.payments.markDemoPaidAndNotify(invoiceNo, dto.token);
    if (!ok) return { ok: false, message: 'الوضع التجريبي غير مفعّل (BTCPay حقيقي) أو رمز غير صالح' };
    return { ok: true, message: 'تمت محاكاة الدفع والتسوية' };
  }
}
