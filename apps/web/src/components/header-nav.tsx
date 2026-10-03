'use client';

import Link from 'next/link';
import { useCart } from '@/lib/cart';

/** Header cluster: search box → track link → cart badge (client so localStorage count is live). */
export default function HeaderNav() {
  const { count, ready } = useCart();
  return (
    <div className="flex items-center gap-3">
      <Link href="/track" className="hidden text-sm font-medium text-slate-600 hover:text-brand-600 sm:block">
        تتبع طلبك
      </Link>
      <Link
        href="/cart"
        className="relative flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-brand-700"
      >
        🛒 السلة
        {ready && count > 0 && (
          <span className="absolute -top-2 -left-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-400 px-1.5 text-xs font-extrabold text-slate-900">
            {count}
          </span>
        )}
      </Link>
    </div>
  );
}
