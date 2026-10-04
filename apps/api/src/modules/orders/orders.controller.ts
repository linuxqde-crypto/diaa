import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { CartService } from '../cart/cart.service';
import { PaymentService } from '../payments/payment.service';
import { CreateGuestOrderDto } from './dto/create-guest-order.dto';
import { mapPrismaError } from '../../common/prisma-error';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly cart: CartService,
    private readonly payments: PaymentService,
  ) {}

  @Post('guest')
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // checkout abuse protection
  @ApiOperation({
    summary:
      'إنشاء طلب ضيف (بريد + سلة + عملة/شبكة الدفع) — يتحقق من المخزون، يحسب الخصم من DB، يسجّل ORDER_CREATED في سجل التدقيق. لا يحجز أكوادًا قبل الدفع. عند اختيار العملة يُنشأ فورًا فاتورة كريبتو بسعر مثبَّت 15 دقيقة.',
  })
  async createGuest(@Body() dto: CreateGuestOrderDto, @Req() req: Request) {
    try {
      const order = await this.cart.createGuestOrder({
        email: dto.email,
        fullNameAr: dto.fullNameAr,
        items: dto.items,
        couponCode: dto.couponCode,
        ip: req.ip,
        userAgent: req.headers['user-agent']?.slice(0, 200),
      });

      // PHASE 3: coin/network chosen at checkout → auto-create the invoice now
      // (rate locked 15 min in Redis + DB). Failure never loses the order —
      // the buyer can retry invoice creation from /pay/:orderNo.
      let invoice: Awaited<ReturnType<PaymentService['createInvoice']>> | null = null;
      if (dto.currency && dto.network) {
        try {
          invoice = await this.payments.createInvoice({
            orderNo: order.orderNo,
            currency: dto.currency,
            network: dto.network,
            ip: req.ip,
          });
        } catch {
          invoice = null; // order stays PENDING; pay page offers "إنشاء فاتورة" retry
        }
      }

      return {
        orderId: order.id,
        orderNo: order.orderNo,
        status: order.status,
        subtotalUsd: Number(order.subtotalUsd),
        discountUsd: Number(order.discountUsd),
        totalUsd: Number(order.totalUsd),
        currency: order.currency,
        items: order.items.map((i) => ({
          productId: i.productId,
          name: i.productNameAr,
          quantity: i.quantity,
          unitPriceUsd: Number(i.unitPriceUsd),
        })),
        ...(invoice ? { invoice } : {}),
        nextStep: 'payment',
      };
    } catch (e) {
      throw mapPrismaError(e);
    }
  }

  @Get('track')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'تتبع الطلب: رقم الطلب + البريد (لا يكشف أي أكواد قبل التسليم)' })
  async track(@Query('orderNo') orderNo: string, @Query('email') email: string) {
    if (!orderNo || !email) {
      return { error: 'يجب إدخال رقم الطلب والبريد الإلكتروني' };
    }
    const result = await this.cart.track(orderNo, email);
    if (!result) return { error: 'لم يتم العثور على طلب مطابق — تحقق من الرقم والبريد' };
    return result;
  }
}
