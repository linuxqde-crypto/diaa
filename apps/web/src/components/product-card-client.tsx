'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ProductListItem } from '@/lib/types';
import { fmtUsd, useCart } from '@/lib/cart';

export default function ProductCardClient({ p }: { p: ProductListItem }) {
  const { add } = useCart();
  const [added, setAdded] = useState(false);

  const onAdd = () => {
    add(
      {
        productId: p.id,
        slug: p.slug,
        nameAr: p.nameAr,
        brand: p.brand,
        priceUsd: p.priceUsd,
        image: p.imageUrls?.[0] ?? null,
      },
      1,
    );
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <Link href={`/product/${p.slug}`} className="relative block h-40 bg-slate-100">
        {/* Image placeholder — real CDN images land with admin CRUD in PHASE 4 */}
        {p.imageUrls?.[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imageUrls[0]} alt={p.nameAr} className="h-full w-full object-contain p-3" />
        ) : (
          <div className="flex h-full items-center justify-center text-5xl opacity-80">🎁</div>
        )}
        {!p.stock.inStock && (
          <span className="absolute top-2 right-2 rounded-full bg-slate-800/90 px-3 py-1 text-xs font-bold text-white">
            نفدت الكمية
          </span>
        )}
        {p.compareAtUsd !== null && p.compareAtUsd > p.priceUsd && (
          <span className="absolute top-2 left-2 rounded-full bg-rose-500 px-3 py-1 text-xs font-bold text-white">
            خصم
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{p.brand}</p>
        <Link href={`/product/${p.slug}`} className="font-bold leading-snug hover:text-brand-700">
          {p.nameAr}
        </Link>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-lg font-extrabold text-slate-900">{fmtUsd(p.priceUsd)}</span>
          {p.compareAtUsd !== null && p.compareAtUsd > p.priceUsd && (
            <span className="text-sm text-slate-400 line-through">{fmtUsd(p.compareAtUsd)}</span>
          )}
        </div>
        <p className="text-xs text-slate-500">
          {p.stock.inStock ? `متوفر · يُدفع بالكريبتو` : 'غير متوفر حاليًا'}
        </p>
        <button
          onClick={onAdd}
          disabled={!p.stock.inStock}
          className={`mt-3 rounded-xl px-4 py-2 text-sm font-bold transition ${
            added
              ? 'bg-emerald-500 text-white'
              : p.stock.inStock
                ? 'bg-brand-600 text-white hover:bg-brand-700'
                : 'cursor-not-allowed bg-slate-200 text-slate-400'
          }`}
        >
          {added ? '✓ تمت الإضافة' : p.stock.inStock ? 'أضف إلى السلة' : 'نفدت'}
        </button>
      </div>
    </div>
  );
}
