/** Shared API types — mirrors the NestJS response shapes (PHASE 2). */

export interface CategorySummary {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string | null;
  icon: string | null;
  _count: { products: number };
}

export interface ProductListItem {
  id: string;
  slug: string;
  brand: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  priceUsd: number;
  compareAtUsd: number | null;
  imageUrls: string[];
  networkHints: string[];
  isFeatured: boolean;
  categoryId: string;
  category: { slug: string; nameAr: string; nameEn: string };
  stock: { available: number; inStock: boolean };
}

export interface ProductDetail extends ProductListItem {
  related: { slug: string; nameAr: string; priceUsd: number; imageUrls: string[]; brand: string }[];
}

export interface Paged<T> {
  items: T[];
  meta: { page: number; limit: number; total: number; pages: number };
}

/** Cart line as stored client-side. */
export interface CartLine {
  productId: string;
  slug: string;
  nameAr: string;
  brand: string;
  priceUsd: number;
  image: string | null;
  qty: number;
}

export interface CouponResult {
  valid: boolean;
  discountUsd: number;
  totalUsd: number;
  coupon: { id: string; code: string; type: string; value: number } | null;
}

export interface GuestOrderResult {
  orderId: string;
  orderNo: string;
  status: string;
  subtotalUsd: number;
  discountUsd: number;
  totalUsd: number;
  currency: string;
  items: { productId: string; name: string; quantity: number; unitPriceUsd: number }[];
  nextStep: string;
}

export interface TrackResult {
  orderNo: string;
  status: string;
  totalUsd?: number;
  createdAt?: string;
  items?: { name: string; quantity: number }[];
  error?: string;
}

export interface CoinQuote {
  currency: 'BTC' | 'ETH' | 'USDT' | 'SOL' | 'BNB';
  network: string[];
  nameAr: string;
  symbol: string;
  usdPerUnit: number;
  perUsd: number;
}
