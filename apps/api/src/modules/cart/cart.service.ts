import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryCodeStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { normalizeCart, CartItem } from './cart.util';

/** Public availability info — NEVER exposes code material (spec: codes only via admin/secret paths). */
export interface StockInfo {
  available: number;
  inStock: boolean;
}

interface CouponRef {
  id: string;
  code: string;
  type: string;
  value: number;
}

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  /** Batched stock check for a cart. Throws 400 with per-item Arabic reasons on shortfall. */
  async validate(items: CartItem[]) {
    const norm = normalizeCart(items);
    const ids = norm.map((i) => i.productId);

    const products = await this.prisma.product.findMany({
      where: { id: { in: ids }, isActive: true },
      select: { id: true, nameAr: true, slug: true, priceUsd: true, isActive: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    const missing = norm.filter((i) => !byId.has(i.productId));
    if (missing.length) {
      throw new BadRequestException(
        `أحد المنتجات لم يعد متوفرًا في المتجر (تم تحديث السلة؟): ${missing
          .map((m) => m.productId)
          .join(', ')}`,
      );
    }

    const counts = await this.prisma.inventoryCode.groupBy({
      by: ['productId'],
      where: { productId: { in: ids }, status: InventoryCodeStatus.AVAILABLE },
      _count: { _all: true },
    });
    const avail = new Map(counts.map((c) => [c.productId, c._count._all]));

    const short = norm.filter((i) => (avail.get(i.productId) ?? 0) < i.quantity);
    if (short.length) {
      throw new BadRequestException(
        `الكمية المتاحة غير كافية: ${short
          .map(
            (s) =>
              `${byId.get(s.productId)!.nameAr} (المطلوب ${s.quantity}، المتاح ${
                avail.get(s.productId) ?? 0
              })`,
          )
          .join('؛ ')}`,
      );
    }

    return {
      norm,
      lines: norm.map((i) => {
        const p = byId.get(i.productId)!;
        return {
          ...p,
          quantity: i.quantity,
          lineTotalUsd: Number(p.priceUsd) * i.quantity,
          available: avail.get(i.productId) ?? 0,
        };
      }),
      subtotalUsd: norm.reduce(
        (sum, i) => sum + Number(byId.get(i.productId)!.priceUsd) * i.quantity,
        0,
      ),
    };
  }

  /** Single-product stock badge for storefront cards. */
  async stockFor(productId: string): Promise<StockInfo> {
    const available = await this.prisma.inventoryCode.count({
      where: { productId, status: InventoryCodeStatus.AVAILABLE },
    });
    return { available, inStock: available > 0 };
  }

  async stockById(id: string): Promise<StockInfo> {
    const exists = await this.prisma.product.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('المنتج غير موجود');
    return this.stockFor(id);
  }

  async stockBySlug(slug: string): Promise<StockInfo & { slug: string }> {
    const product = await this.prisma.product.findUnique({ where: { slug }, select: { id: true } });
    if (!product) throw new NotFoundException('المنتج غير موجود');
    return { ...(await this.stockFor(product.id)), slug };
  }

  /** Coupon preview used at checkout before order creation (PHASE 2 scope: validation + math only). */
  async evaluateCoupon(code: string | undefined, subtotalUsd: number, productIds: string[]) {
    if (!code) return { discountUsd: 0, coupon: null as null | CouponRef };
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: code.toUpperCase() },
      include: { products: { select: { productId: true } } },
    });
    const now = new Date();
    if (!coupon || !coupon.isActive) throw new BadRequestException('رمز الخصم غير صالح أو منتهي');
    if (coupon.startsAt && coupon.startsAt > now) throw new BadRequestException('رمز الخصم لم يبدأ بعد');
    if (coupon.endsAt && coupon.endsAt < now) throw new BadRequestException('انتهت صلاحية رمز الخصم');
    if (coupon.maxRedemptions !== null && coupon.redeemedCount >= coupon.maxRedemptions) {
      throw new BadRequestException('تم استنفاد رمز الخصم');
    }
    if (coupon.minOrderUsd !== null && subtotalUsd < Number(coupon.minOrderUsd)) {
      throw new BadRequestException(
        `الحد الأدنى للطلب لاستخدام هذا الرمز ${Number(coupon.minOrderUsd)}$`,
      );
    }
    // Product-scoped coupons: require every cart line to belong to the allowed set.
    if (coupon.products.length) {
      const allowed = new Set(coupon.products.map((p) => p.productId));
      if (!productIds.every((id) => allowed.has(id))) {
        throw new BadRequestException('رمز الخصم لا ينطبق على جميع منتجات السلة');
      }
    }
    let discount =
      coupon.type === 'PERCENT'
        ? (subtotalUsd * Number(coupon.value)) / 100
        : Math.min(Number(coupon.value), subtotalUsd);
    discount = Math.round(discount * 100) / 100;
    return {
      discountUsd: discount,
      coupon: { id: coupon.id, code: coupon.code, type: coupon.type, value: Number(coupon.value) },
    };
  }

  /** Public coupon check for the storefront checkout UI (never mutates state). */
  async checkCoupon(code: string, items: CartItem[]) {
    const norm = normalizeCart(items);
    // prices from DB, not client
    const products = await this.prisma.product.findMany({
      where: { id: { in: norm.map((i) => i.productId) }, isActive: true },
      select: { id: true, priceUsd: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    if (byId.size !== norm.length) throw new BadRequestException('أحد المنتجات غير متوفر');
    const subtotalUsd = norm.reduce((s, i) => s + Number(byId.get(i.productId)!.priceUsd) * i.quantity, 0);
    const { discountUsd, coupon } = await this.evaluateCoupon(code, subtotalUsd, norm.map((i) => i.productId));
    return {
      valid: !!coupon,
      discountUsd,
      totalUsd: Math.max(0, Math.round((subtotalUsd - discountUsd) * 100) / 100),
      coupon,
    };
  }

  /**
   * Guest-order creation. Stock is only *validated* here — inventory codes are NEVER
   * reserved before payment confirmation (spec: allocation happens in PHASE 3 webhook
   * handler under SELECT ... FOR UPDATE SKIP LOCKED). A PENDING order therefore does
   * not block other buyers; the final allocator re-checks availability at confirmation.
   */
  async createGuestOrder(input: {
    email: string;
    fullNameAr?: string;
    items: CartItem[];
    couponCode?: string;
    ip?: string;
    userAgent?: string;
  }) {
    const { norm, lines, subtotalUsd } = await this.validate(input.items);
    const { discountUsd, coupon } = await this.evaluateCoupon(
      input.couponCode,
      subtotalUsd,
      norm.map((i) => i.productId),
    );
    const totalUsd = Math.max(0, Math.round((subtotalUsd - discountUsd) * 100) / 100);

    // Guest accounts are created-or-looked-up by email so orders can later be tracked in "استلمت طلبًا؟".
    const user = await this.prisma.user.upsert({
      where: { email: input.email.toLowerCase() },
      update: {},
      create: {
        email: input.email.toLowerCase(),
        fullNameAr: input.fullNameAr ?? null,
        isGuest: true,
      },
    });

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNo: await this.nextOrderNo(),
          userId: user.id,
          email: user.email,
          status: 'PENDING',
          currency: 'USD',
          subtotalUsd: new Prisma.Decimal(subtotalUsd.toFixed(2)),
          discountUsd: new Prisma.Decimal(discountUsd.toFixed(2)),
          totalUsd: new Prisma.Decimal(totalUsd.toFixed(2)),
          couponId: coupon?.id ?? null,
          items: {
            createMany: {
              data: lines.map((l) => ({
                productId: l.id,
                quantity: l.quantity,
                unitPriceUsd: l.priceUsd,
                productNameAr: l.nameAr,
                productSlugSnapshot: l.slug,
              })),
            },
          },
        },
        include: { items: true },
      });
      if (coupon) {
        await tx.coupon.update({ where: { id: coupon.id }, data: { redeemedCount: { increment: 1 } } });
      }
      return created;
    });

    // Immutable audit trail for every financial action (append-only table, DB trigger-enforced).
    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorEmail: order.email,
        action: 'ORDER_CREATED',
        entityType: 'order',
        entityId: order.id,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        metadata: {
          orderNo: order.orderNo,
          subtotalUsd: order.subtotalUsd.toString(),
          discountUsd: order.discountUsd.toString(),
          totalUsd: order.totalUsd.toString(),
          coupon: coupon?.code ?? null,
          guest: true,
          items: order.items.map((i) => ({ productId: i.productId, qty: i.quantity })),
        },
      },
    });

    return order;
  }

  /** Public order tracking — requires BOTH orderNo and the exact delivery email (anti-enumeration). */
  async track(orderNo: string, email: string) {
    const order = await this.prisma.order.findFirst({
      where: { orderNo: orderNo.trim().toUpperCase(), email: email.trim().toLowerCase() },
      select: {
        orderNo: true,
        status: true,
        totalUsd: true,
        createdAt: true,
        deliveredAt: true,
        items: { select: { productNameAr: true, quantity: true } },
        invoices: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            status: true,
            expiresAt: true,
            cryptoAmount: true,
            currency: true,
            network: true,
            confirmations: true,
            requiredConfirmations: true,
          },
        },
      },
    });
    if (!order) return null;
    return {
      orderNo: order.orderNo,
      status: order.status,
      totalUsd: Number(order.totalUsd),
      createdAt: order.createdAt,
      deliveredAt: order.deliveredAt,
      items: order.items,
      invoice: order.invoices[0] ?? null,
    };
  }

  private async nextOrderNo(): Promise<string> {
    const y = new Date().getFullYear();
    const count = await this.prisma.order.count({
      where: { createdAt: { gte: new Date(`${y}-01-01T00:00:00Z`) } },
    });
    return `KR-${y}-${String(count + 1).padStart(6, '0')}`;
  }
}
