'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fmtUsd, useCart } from '@/lib/cart';

/** Cart page — client-only (localStorage-backed). Server re-validates stock at checkout. */
export default function CartView() {
  const { lines, setQty, remove, subtotalUsd, count, ready } = useCart();
  const router = useRouter();

  if (!ready) return <p className="py-16 text-center text-slate-400">جارٍ تحميل السلة…</p>;

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-6xl">🛒</p>
        <h1 className="mt-4 text-2xl font-extrabold text-slate-800">سلتك فارغة</h1>
        <p className="mt-2 text-slate-500">أضف بطاقات هدايا أو تعبئة ألعاب لتبدأ الشراء بالكريبتو.</p>
        <Link
          href="/search"
          className="mt-6 inline-block rounded-xl bg-brand-600 px-6 py-3 font-bold text-white hover:bg-brand-700"
        >
          تصفّح المنتجات
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-extrabold text-slate-800">سلة المشتريات ({count})</h1>

      <div className="mt-6 space-y-3">
        {lines.map((l) => (
          <div key={l.productId} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-3xl">
              🎁
            </div>
            <div className="min-w-0 flex-1">
              <Link href={`/product/${l.slug}`} className="block truncate font-bold text-slate-800 hover:text-brand-700">
                {l.nameAr}
              </Link>
              <p className="text-xs text-slate-500">{l.brand}</p>
              <p className="mt-1 text-sm font-bold text-brand-700">{fmtUsd(l.priceUsd)}</p>
            </div>
            <div className="flex items-center overflow-hidden rounded-lg border border-slate-300">
              <button onClick={() => setQty(l.productId, l.qty - 1)} className="px-3 py-1.5 font-bold hover:bg-slate-100">−</button>
              <span className="w-10 border-x border-slate-300 py-1.5 text-center font-bold" dir="ltr">{l.qty}</span>
              <button onClick={() => setQty(l.productId, l.qty + 1)} className="px-3 py-1.5 font-bold hover:bg-slate-100">+</button>
            </div>
            <div className="hidden w-24 text-left font-extrabold text-slate-800 sm:block" dir="ltr">
              {fmtUsd(l.priceUsd * l.qty)}
            </div>
            <button onClick={() => remove(l.productId)} className="text-lg text-slate-400 hover:text-rose-600" aria-label="حذف">
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between text-lg">
          <span className="font-bold text-slate-600">المجموع الفرعي</span>
          <span className="font-extrabold text-slate-900" dir="ltr">{fmtUsd(subtotalUsd)}</span>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          يُعاد التحقق من المخزون والأسعار من الخادم عند إتمام الطلب — أكواد المخزون لا تُحجز إلا بعد تأكيد الدفع.
        </p>
        <button
          onClick={() => router.push('/checkout')}
          className="mt-4 w-full rounded-xl bg-brand-600 py-3.5 text-lg font-extrabold text-white shadow hover:bg-brand-700"
        >
          إتمام الشراء بالكريبتو ←
        </button>
      </div>
    </div>
  );
}
