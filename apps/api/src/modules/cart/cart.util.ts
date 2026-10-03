import { BadRequestException } from '@nestjs/common';

export const CART_ITEM = Symbol('CART_ITEM');

export interface CartItem {
  productId: string;
  quantity: number;
}

export interface CartDtoShape {
  items: CartItem[];
}

/**
 * Single source of truth for cart validation + normalization.
 * Used by the API DTO (@ValidateNested via @Type(CART_ITEM)) and mirrored 1:1 on the frontend.
 */
export function normalizeCart(items: CartItem[]): CartItem[] {
  const merged = new Map<string, number>();
  for (const it of items) {
    if (!it || typeof it.productId !== 'string' || !it.productId) {
      throw new BadRequestException('سلة غير صالحة: معرف المنتج مفقود');
    }
    const q = Math.floor(Number(it.quantity));
    if (!Number.isFinite(q) || q < 1 || q > 20) {
      throw new BadRequestException(`كمية غير صالحة للمنتج ${it.productId} (1–20 مسموحة)`);
    }
    merged.set(it.productId, Math.min(20, (merged.get(it.productId) ?? 0) + q));
  }
  return [...merged.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}
