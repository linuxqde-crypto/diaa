'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ProductListItem } from '@/lib/types';
import { fmtUsd, useCart } from '@/lib/cart';

/** Qty selector + add-to-cart + buy-now (pushes straight to /checkout with the line staged). */
export default function ProductPurchaseBox({ p }: { p: ProductListItem }) {
  const { add } = useCart();
  const router = useRouter();
  const [qty, setQty] = useState(1);

  const stage = () =>
    add(
      {
        productId: p.id,
        slug: p.slug,
        nameAr: p.nameAr,
        brand: p.brand,
        priceUsd: p.priceUsd,
        image: p.imageUrls?.[0] ?? null,
      },
      qty,
    );

  const buyNow = () => {
    stage();
    router.push('/checkout');
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-bold uppercase tracking-wide text-brand-600">{p.brand}</p>
      <h1 className="text-2xl font-extrabold text-slate-900 md:text-3xl">{p.nameAr}</h1>

      <div className="flex items-baseline gap-3">
        <span className="text-3xl font-extrabold text-brand-700">{fmtUsd(p.priceUsd)}</span>
        {p.compareAtUsd !== null && p.compareAtUsd > p.priceUsd && (
          <span className="text-lg text-slate-400 line-through">{fmtUsd(p.compareAtUsd)}</span>
        )}
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            p.stock.inStock ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
          }`}
        >
          {p.stock.inStock ? '✓ متوفر الآن' : 'نفدت الكمية'}
        </span>
      </div>

      <p className="text-sm text-slate-500">
        الدفع بـ {p.networkHints.length ? p.networkHints.join(' · ') : 'BTC · ETH · USDT · SOL · BNB'} — السعر بالدولار
        ويُحوَّل لحظيًا للعملة المختارة.
      </p>

      {/* Qty stepper */}
      <div className="mt-2 flex items-center gap-3">
        <span className="text-sm font-bold text-slate-700">الكمية:</span>
        <div className="flex items-center overflow-hidden rounded-xl border border-slate-300 bg-white">
          <button
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="px-4 py-2 text-lg font-bold text-slate-600 hover:bg-slate-100"
            aria-label="تقليل"
          >
            −
          </button>
          <input
            value={qty}
            onChange={(e) => {
              const n = Number(e.target.value.replace(/\D/g, ''));
              setQty(Math.min(20, Math.max(1, Number.isFinite(n) && n > 0 ? n : 1)));
            }}
            className="w-14 border-x border-slate-300 py-2 text-center font-bold focus:outline-none"
            inputMode="numeric"
            dir="ltr"
          />
          <button
            onClick={() => setQty((q) => Math.min(20, q + 1))}
            className="px-4 py-2 text-lg font-bold text-slate-600 hover:bg-slate-100"
            aria-label="زيادة"
          >
            +
          </button>
        </div>
        <span className="text-sm text-slate-400">(بحد أقصى 20)</span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          onClick={stage}
          disabled={!p.stock.inStock}
          className="rounded-xl border-2 border-brand-600 px-6 py-3 font-bold text-brand-700 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
        >
          🛒 أضف إلى السلة
        </button>
        <button
          onClick={buyNow}
          disabled={!p.stock.inStock}
          className="rounded-xl bg-brand-600 px-6 py-3 font-bold text-white shadow transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          ⚡ اشترِ الآن بالكريبتو
        </button>
      </div>

      {!p.stock.inStock && (
        <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
          نفدت جميع الأكواد الحالية — نتوقع إعادة التخزين قريبًا. جرّد الطلب لاحقًا أو تصفح بدائل القسم.
        </p>
      )}
    </div>
  );
}
