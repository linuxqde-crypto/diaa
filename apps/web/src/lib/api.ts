/**
 * Client-side fetch wrapper. Browser always talks same-origin `/backend/*`
 * which next.config rewrites to the NestJS API (see apps/web/next.config.mjs).
 */
import type {
  CategorySummary,
  CoinQuote,
  CouponResult,
  GuestOrderResult,
  InvoiceView,
  Paged,
  ProductDetail,
  ProductListItem,
  RevealResult,
  TrackResult,
} from './types';

const BASE = '/backend';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (Array.isArray(body?.message) ? body.message.join('؛ ') : body?.message) ||
      `خطأ في الخادم (${res.status})`;
    throw new Error(msg);
  }
  return body as T;
}

export const api = {
  categories: () => req<CategorySummary[]>('/categories'),
  products: (q: { category?: string; search?: string; sort?: string; page?: number }) => {
    const params = new URLSearchParams();
    Object.entries(q).forEach(([k, v]) => v !== undefined && v !== '' && params.set(k, String(v)));
    return req<Paged<ProductListItem>>(`/products?${params.toString()}`);
  },
  featured: (limit = 8) => req<ProductListItem[]>(`/products/featured?limit=${limit}`),
  product: (slug: string) => req<ProductDetail>(`/products/${encodeURIComponent(slug)}`),
  validateCart: (items: { productId: string; quantity: number }[]) =>
    req<{ ok: boolean }>('/cart/validate', { method: 'POST', body: JSON.stringify({ items }) }),
  checkCoupon: (code: string, items: { productId: string; quantity: number }[]) =>
    req<CouponResult>('/coupons/check', { method: 'POST', body: JSON.stringify({ code, items }) }),
  createGuestOrder: (payload: {
    email: string;
    fullNameAr?: string;
    items: { productId: string; quantity: number }[];
    couponCode?: string;
    currency?: string;
    network?: string;
  }) => req<GuestOrderResult>('/orders/guest', { method: 'POST', body: JSON.stringify(payload) }),
  track: (orderNo: string, email: string) =>
    req<TrackResult>(`/orders/track?orderNo=${encodeURIComponent(orderNo)}&email=${encodeURIComponent(email)}`),
  quotes: () => req<CoinQuote[]>('/rates/crypto'),

  // ── PHASE 3: crypto payment flow ──────────────────────────────
  createInvoice: (orderNo: string, currency: string, network: string) =>
    req<InvoiceView>('/payments/invoices', {
      method: 'POST',
      body: JSON.stringify({ orderNo, currency, network }),
    }),
  invoiceStatus: (invoiceNo: string, token: string) =>
    req<InvoiceView>(`/payments/invoices/${encodeURIComponent(invoiceNo)}?token=${encodeURIComponent(token)}`),
  requote: (invoiceNo: string, token: string) =>
    req<InvoiceView>(`/payments/invoices/${encodeURIComponent(invoiceNo)}/requote`, {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
  submitRefundAddress: (invoiceNo: string, token: string, refundAddress: string) =>
    req<{ ok: boolean; message?: string; error?: string }>(
      `/payments/invoices/${encodeURIComponent(invoiceNo)}/refund-address`,
      { method: 'POST', body: JSON.stringify({ token, refundAddress }) },
    ),
  demoSettle: (invoiceNo: string, token: string) =>
    req<{ ok: boolean; message?: string }>('/payments/demo/settle', {
      method: 'POST',
      body: JSON.stringify({ invoiceNo, token }),
    }),
  revealCodes: (orderNo: string, email: string) =>
    req<RevealResult>(
      `/payments/orders/${encodeURIComponent(orderNo)}/reveal?email=${encodeURIComponent(email)}`,
    ),
};

/** Extract a readable Arabic error from unknown thrown values. */
export function errText(e: unknown): string {
  return e instanceof Error ? e.message : 'حدث خطأ غير متوقع، حاول مرة أخرى';
}
