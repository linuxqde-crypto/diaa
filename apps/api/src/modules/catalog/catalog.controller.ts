import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CatalogService } from './catalog.service';
import { CartService } from '../cart/cart.service';
import { CartDto } from '../cart/dto/cart.dto';
import { CheckCouponDto } from '../cart/dto/check-coupon.dto';
import { QueryProductsDto } from './dto/query-products.dto';

@ApiTags('catalog')
@Controller()
@Throttle({ default: { limit: 60, ttl: 60_000 } }) // public catalog endpoints rate-limited
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly cart: CartService,
  ) {}

  @Get('categories')
  @ApiOperation({ summary: 'الفئات النشطة مع عدد المنتجات (Arabic-first)' })
  categories() {
    return this.catalog.categories();
  }

  @Get('products')
  @ApiOperation({ summary: 'قائمة المنتجات — تصفية بالفئة/بحث/ترتيب + ترقيم صفحات + المخزون العام' })
  products(@Query() q: QueryProductsDto) {
    return this.catalog.products(q);
  }

  @Get('products/featured')
  @ApiOperation({ summary: 'المنتجات المميزة للصفحة الرئيسية' })
  featured(@Query('limit') limit?: number) {
    return this.catalog.featured(Math.min(24, Math.max(1, Number(limit) || 8)));
  }

  @Get('products/:slug')
  @ApiOperation({ summary: 'تفاصيل منتج عبر الـ slug + badges المخزون + منتجات مشابهة' })
  bySlug(@Param('slug') slug: string) {
    return this.catalog.productBySlug(slug);
  }

  @Post('cart/validate')
  @ApiOperation({ summary: 'تحقق من صلاحية السلة والمخزون قبل إتمام الطلب (لا يحجز أي أكواد)' })
  validateCart(@Body() body: CartDto) {
    return this.cart.validate(body.items);
  }

  @Post('coupons/check')
  @ApiOperation({ summary: 'فحص كوبون الخصم مقابل سلة محددة (يعيد الخصم والإجمالي محسوبًا من DB)' })
  checkCoupon(@Body() body: CheckCouponDto) {
    return this.cart.checkCoupon(body.code, body.items);
  }
}
