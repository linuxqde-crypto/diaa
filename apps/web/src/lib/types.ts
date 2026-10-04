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
  /** Present when the buyer picked coin/network at checkout (PHASE 3 auto-invoice). */
  invoice?: InvoiceView;
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

/** Mirrors api PublicInvoice (+ one-time accessToken on creation). */
export interface InvoiceView {
  invoiceNo: string;
  status: 'PENDING' | 'PAID' | 'UNDERPAID' | 'OVERPAID' | 'EXPIRED' | 'CONFIRMED' | 'REFUND_ISSUED';
  currency: string;
  network: string;
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
  accessToken?: string;
}

export interface RevealResult {
  ready: boolean;
  status?: string;
  message?: string;
  orderNo?: string;
  items?: { nameAr: string; quantity: number; codes: string[] }[];
}
