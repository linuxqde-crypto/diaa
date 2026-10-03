import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { CartService } from '../cart/cart.service';

const PUBLIC_PRODUCT_SELECT = {
  id: true,
  slug: true,
  brand: true,
  nameAr: true,
  nameEn: true,
  descriptionAr: true,
  descriptionEn: true,
  priceUsd: true,
  compareAtUsd: true,
  imageUrls: true,
  networkHints: true,
  isFeatured: true,
  isActive: true,
  categoryId: true,
  category: { select: { slug: true, nameAr: true, nameEn: true } },
} satisfies Prisma.ProductSelect;

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
  ) {}

  async categories() {
    return this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        slug: true,
        nameAr: true,
        nameEn: true,
        descriptionAr: true,
        icon: true,
        _count: { select: { products: { where: { isActive: true } } } },
      },
    });
  }

  async products(q: {
    category?: string;
    search?: string;
    sort?: 'newest' | 'price_asc' | 'price_desc';
    page: number;
    limit: number;
  }) {
    const where: Prisma.ProductWhereInput = {
      isActive: true,
      ...(q.category ? { category: { slug: q.category, isActive: true } } : {}),
      ...(q.search
        ? {
            OR: [
              { nameAr: { contains: q.search, mode: 'insensitive' } },
              { nameEn: { contains: q.search, mode: 'insensitive' } },
              { brand: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.ProductOrderByWithRelationInput[] =
      q.sort === 'price_asc'
        ? [{ priceUsd: 'asc' }]
        : q.sort === 'price_desc'
          ? [{ priceUsd: 'desc' }]
          : [{ createdAt: 'desc' }];

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy,
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        select: PUBLIC_PRODUCT_SELECT,
      }),
    ]);

    // Batched stock badges (one groupBy for the whole page — no N+1).
    const ids = rows.map((r) => r.id);
    const counts = await this.prisma.inventoryCode.groupBy({
      by: ['productId'],
      where: { productId: { in: ids }, status: 'AVAILABLE' },
      _count: { _all: true },
    });
    const avail = new Map(counts.map((c) => [c.productId, c._count._all]));

    const items = rows.map((p) => ({
      ...p,
      priceUsd: Number(p.priceUsd),
      compareAtUsd: p.compareAtUsd === null ? null : Number(p.compareAtUsd),
      stock: { available: avail.get(p.id) ?? 0, inStock: (avail.get(p.id) ?? 0) > 0 },
    }));

    return {
      items,
      meta: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) || 1 },
    };
  }

  /** Featured products for the home page (falls back to newest when none are flagged). */
  async featured(limit = 8) {
    const rows = await this.prisma.product.findMany({
      where: { isActive: true, isFeatured: true },
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: PUBLIC_PRODUCT_SELECT,
    });
    if (!rows.length) {
      return this.products({ sort: 'newest', page: 1, limit }).then((r) => r.items);
    }
    const ids = rows.map((f) => f.id);
    const counts = await this.prisma.inventoryCode.groupBy({
      by: ['productId'],
      where: { productId: { in: ids }, status: 'AVAILABLE' },
      _count: { _all: true },
    });
    const avail = new Map(counts.map((c) => [c.productId, c._count._all]));
    return rows.map((p) => ({
      ...p,
      priceUsd: Number(p.priceUsd),
      compareAtUsd: p.compareAtUsd === null ? null : Number(p.compareAtUsd),
      stock: { available: avail.get(p.id) ?? 0, inStock: (avail.get(p.id) ?? 0) > 0 },
    }));
  }

  async productBySlug(slug: string) {
    const p = await this.prisma.product.findFirst({
      where: { slug, isActive: true },
      select: PUBLIC_PRODUCT_SELECT,
    });
    if (!p) throw new NotFoundException('المنتج غير موجود أو لم يعد متاحًا');

    const related = await this.prisma.product.findMany({
      where: { categoryId: p.categoryId, isActive: true, id: { not: p.id } },
      take: 4,
      select: { slug: true, nameAr: true, priceUsd: true, imageUrls: true, brand: true },
    });

    return {
      ...p,
      priceUsd: Number(p.priceUsd),
      compareAtUsd: p.compareAtUsd === null ? null : Number(p.compareAtUsd),
      stock: await this.cart.stockFor(p.id),
      related,
    };
  }
}
