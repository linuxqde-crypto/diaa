'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, errText } from '@/lib/api';
import { fmtUsd, useCart } from '@/lib/cart';
import type { CoinQuote, CouponResult, GuestOrderResult } from '@/lib/types';

/**
 * PHASE 2 guest checkout: email + optional name + coupon → POST /orders/guest.
 * On success we stash the orderNo and route to /pay/[orderNo] — the coin/network
 * picker with locked rate + QR arrives in PHASE 3 (invoice creation endpoint).
 */
export default function CheckoutView() {
  const { lines, subtotalUsd, ready, clear } = useCart();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [fullNameAr, setFullNameAr] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [coupon, setCoupon] = useState<CouponResult | null>(null);
  const [quotes, setQuotes] = useState<CoinQuote[]>([]);
  const [coinKey, setCoinKey] = useState('USDT:TRON'); // currency:network — default USDT-TRC20
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Live crypto reference rates; the chosen pair's rate gets LOCKED for 15 min
  // server-side when the invoice is created alongside the order (PHASE 3).
  useEffect(() => {
    api.quotes().then((qs) => {
      setQuotes(qs);
      if (qs.length > 0 && !qs.some((q) => `${q.currency}:${q.network[0]}` === 'USDT:TRON')) {
        setCoinKey(`${qs[0].currency}:${qs[0].network[0]}`);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (ready && lines.length === 0 && !busy) router.replace('/cart');
  }, [ready, lines.length, busy, router]);

  const cartItems = lines.map((l) => ({ productId: l.productId, quantity: l.qty }));

  const applyCoupon = async () => {
    setErr(null);
    setCoupon(null);
    if (!couponCode.trim()) return;
    try {
      const res = await api.checkCoupon(couponCode.trim().toUpperCase(), cartItems);
      setCoupon(res);
    } catch (e) {
      setErr(errText(e));
    }
  };

  const submit = async () => {
    setErr(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErr('أدخل بريدًا إلكترونيًا صالحًا — إليه سيتم تسليم الأكواد بعد الدفع.');
      return;
    }
    setBusy(true);
    try {
      const [currency, network] = coinKey.split(':');
      const order: GuestOrderResult = await api.createGuestOrder({
        email,
        fullNameAr: fullNameAr.trim() || undefined,
        items: cartItems,
        couponCode: coupon?.valid ? coupon.coupon!.code : undefined,
        currency,
        network,
      });
      // Order + invoice created atomically server-side (rate locked 15 min).
      sessionStorage.setItem('kroto.lastOrder', JSON.stringify({ ...order, email }));
      if (order.invoice?.accessToken) {
        sessionStorage.setItem(`kroto.inv.${order.orderNo}`, order.invoice.accessToken);
      }
      clear();
      router.push(`/pay/${order.orderNo}`);
    } catch (e) {
      setErr(errText(e));
      setBusy(false);
    }
  };

  if (!ready) return <p className="py-16 text-center text-slate-400">جارٍ التحميل…</p>;

  const total = coupon?.valid ? coupon.totalUsd : subtotalUsd;
  const [selCurrency, selNetwork] = coinKey.split(':');
  const selQuote = quotes.find((q) => q.currency === selCurrency && q.network.includes(selNetwork));
  const estimateCrypto = selQuote ? total * selQuote.perUsd : null;

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 px-4 py-8 lg:grid-cols-[1fr_360px]">
      {/* Left: form */}
      <div>
        <h1 className="text-2xl font-extrabold text-slate-800">إتمام الشراء (بدون حساب)</h1>
        <p className="mt-1 text-sm text-slate-500">
          لا نحتاج تسجيل — فقط بريدك لتسليم الكود. الدفع كريبتو بالكامل عبر عنوان فريد لكل طلب.
        </p>

        <div className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-slate-700">البريد الإلكتروني *</span>
            <input
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 focus:border-brand-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-slate-700">الاسم (اختياري — للتحية في الإيميل)</span>
            <input
              value={fullNameAr}
              onChange={(e) => setFullNameAr(e.target.value)}
              placeholder="مثال: ضياء"
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 focus:border-brand-500 focus:outline-none"
            />
          </label>

          <div>
            <span className="mb-1 block text-sm font-bold text-slate-700">رمز الخصم</span>
            <div className="flex gap-2">
              <input
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                placeholder="KROTO10"
                dir="ltr"
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 focus:border-brand-500 focus:outline-none"
              />
              <button
                onClick={applyCoupon}
                className="shrink-0 rounded-xl bg-slate-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-700"
              >
                تطبيق
              </button>
            </div>
            {coupon?.valid && (
              <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
                ✓ {coupon.coupon!.code}: خصم {fmtUsd(coupon.discountUsd)}
              </p>
            )}
          </div>

          {err && <p className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{err}</p>}

          {/* Coin + network picker — rate gets locked for 15 min when the invoice is created */}
          <div>
            <span className="mb-2 block text-sm font-bold text-slate-700">اختر عملة الدفع والشبكة *</span>
            {quotes.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                جارٍ جلب الأسعار اللحظية… (يمكن المتابعة والاختيار من صفحة الدفع)
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {quotes.flatMap((q) =>
                  q.network.map((net) => {
                    const key = `${q.currency}:${net}`;
                    const active = coinKey === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setCoinKey(key)}
                        dir="ltr"
                        className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                          active
                            ? 'border-brand-500 bg-brand-50 font-extrabold text-brand-700 ring-2 ring-brand-500'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <span className="block font-bold">{q.symbol}</span>
                        <span className="block text-[11px] text-slate-400">{net}</span>
                      </button>
                    );
                  }),
                )}
              </div>
            )}
          </div>

          <button
            onClick={submit}
            disabled={busy || lines.length === 0 || quotes.length === 0}
            className="w-full rounded-xl bg-brand-600 py-3.5 text-lg font-extrabold text-white shadow hover:bg-brand-700 disabled:bg-slate-300"
          >
            {busy
              ? 'جارٍ إنشاء الطلب وتثبيت السعر…'
              : estimateCrypto
                ? `ادفع ≈${estimateCrypto.toFixed(4)} ${selQuote?.symbol ?? selCurrency} (${selNetwork}) · ${fmtUsd(total)}`
                : `متابعة للدفع بالكريبتو · ${fmtUsd(total)}`}
          </button>
          <p className="text-center text-xs text-slate-400">
            بالمتابعة أنت توافق على أن الكود الرقمي غير قابل للاسترجاع بعد التسليم.
          </p>
        </div>
      </div>

      {/* Right: summary */}
      <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-extrabold text-slate-800">ملخص الطلب</h2>
        <ul className="mt-4 space-y-2 text-sm">
          {lines.map((l) => (
            <li key={l.productId} className="flex justify-between gap-2">
              <span className="truncate text-slate-600">
                {l.nameAr} <span className="text-slate-400">×{l.qty}</span>
              </span>
              <span className="shrink-0 font-bold" dir="ltr">{fmtUsd(l.priceUsd * l.qty)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 space-y-1 border-t border-dashed border-slate-200 pt-4 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">المجموع الفرعي</span><span dir="ltr">{fmtUsd(subtotalUsd)}</span></div>
          {coupon?.valid && (
            <div className="flex justify-between text-emerald-600"><span>الخصم</span><span dir="ltr">−{fmtUsd(coupon.discountUsd)}</span></div>
          )}
          <div className="flex justify-between text-base font-extrabold text-slate-900">
            <span>الإجمالي</span><span dir="ltr">{fmtUsd(total)}</span>
          </div>
        </div>

        {quotes.length > 0 && (
          <div className="mt-5 rounded-xl bg-slate-50 p-4 text-xs text-slate-600">
            <p className="mb-2 font-bold text-slate-700">أسعار لحظية استرشادية (تُثبَّت عند إنشاء الفاتورة):</p>
            {quotes.map((q) => (
              <div key={q.currency} className="flex justify-between py-0.5" dir="ltr">
                <span>{q.symbol}</span>
                <span>{q.perUsd} {q.symbol}/$</span>
              </div>
            ))}
          </div>
        )}

        <Link href="/cart" className="mt-4 block text-center text-sm font-bold text-brand-600 hover:underline">
          ← العودة للسلة
        </Link>
      </aside>
    </div>
  );
}
