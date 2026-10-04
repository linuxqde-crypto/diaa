'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, errText } from '@/lib/api';
import { fmtUsd } from '@/lib/cart';
import InvoicePanel from './invoice-panel';
import type { CoinQuote, GuestOrderResult, InvoiceView } from '@/lib/types';

interface Stashed extends GuestOrderResult {
  email: string;
}

/**
 * PHASE 3 payment page: coin/network picker → POST /payments/invoices
 * (rate locked 15 min in Redis + DB) → QR + exact amount + live countdown +
 * webhook-driven confirmation tracker + on-screen reveal after delivery.
 */
export default function PayView({ orderNo }: { orderNo: string }) {
  const [order, setOrder] = useState<Stashed | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [quotes, setQuotes] = useState<CoinQuote[]>([]);
  const [selected, setSelected] = useState<string>('USDT:TRON');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [invoice, setInvoice] = useState<InvoiceView | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('kroto.lastOrder');
      if (raw) {
        const o = JSON.parse(raw) as Stashed;
        if (o.orderNo === orderNo) {
          setOrder(o);
          // Checkout already auto-created the invoice (coin picked at checkout).
          if (o.invoice) setInvoice(o.invoice);
        }
      }
    } catch {
      /* ignore malformed stash */
    }
    // Fallback: verify via public tracking endpoint using stashed email.
    if (!order) {
      try {
        const raw = sessionStorage.getItem('kroto.lastOrder');
        if (raw) {
          const o = JSON.parse(raw) as Stashed;
          api.track(o.orderNo, o.email)
            .then((t) => t.error ? setNotFound(true) : setOrder(o))
            .catch(() => setNotFound(true));
        } else {
          setNotFound(true);
        }
      } catch {
        setNotFound(true);
      }
    }
    api.quotes().then(setQuotes).catch(() => {});
  }, [orderNo]); // eslint-disable-line react-hooks/exhaustive-deps

  const coin = quotes.find((q) => `${q.currency}:${q.network[0]}` === selected) ?? quotes[0];

  const createInvoice = async () => {
    setErr(null);
    const [currency, network] = selected.split(':');
    if (!currency || !network) {
      setErr('اختر عملة وشبكة الدفع أولًا.');
      return;
    }
    setBusy(true);
    try {
      const inv = await api.createInvoice(orderNo, currency, network);
      setInvoice(inv);
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };

  if (notFound) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-5xl">🧾</p>
        <h1 className="mt-4 text-2xl font-extrabold text-slate-800">لم نعثر على هذا الطلب في هذه المتصفح</h1>
        <p className="mt-2 text-sm text-slate-500">
          بيانات الفاتورة مرتبطة بجلسة الشراء. استخدم{' '}
          <Link href="/track" className="font-bold text-brand-600 underline">صفحة التتبع</Link> برقم الطلب وبريدك.
        </p>
        <Link href="/" className="mt-6 inline-block rounded-xl bg-brand-600 px-6 py-3 font-bold text-white">العودة للرئيسية</Link>
      </div>
    );
  }

  if (!order) return <p className="py-16 text-center text-slate-400">جارٍ تحميل الطلب…</p>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold text-slate-800">الدفع للطلب <span dir="ltr" className="text-brand-700">{order.orderNo}</span></h1>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">بانتظار الدفع</span>
        </div>
        <p className="mt-1 text-sm text-slate-500">سيُرسل الكود إلى: <b dir="ltr">{order.email}</b></p>

        <ul className="mt-4 divide-y divide-dashed divide-slate-200 border-t border-slate-200 text-sm">
          {order.items.map((i, n) => (
            <li key={n} className="flex justify-between py-2">
              <span>{i.name} ×{i.quantity}</span>
              <span className="font-bold" dir="ltr">{fmtUsd(i.unitPriceUsd * i.quantity)}</span>
            </li>
          ))}
        </ul>
        {order.discountUsd > 0 && (
          <p className="mt-1 text-sm text-emerald-600">خصم الكوبون: −{fmtUsd(order.discountUsd)}</p>
        )}
        <p className="mt-2 flex justify-between text-lg font-extrabold">
          <span>المبلغ المطلوب</span>
          <span dir="ltr">{fmtUsd(order.totalUsd)}</span>
        </p>
      </div>

      {/* Coin picker — hidden once an invoice exists (its network/amount are locked). */}
      {!invoice && (
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-extrabold text-slate-800">اختر عملة وشبكة الدفع</h2>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {quotes.flatMap((q) =>
            q.network.map((net) => {
              const id = `${q.currency}:${net}`;
              return (
                <button
                  key={id}
                  onClick={() => setSelected(id)}
                  className={`rounded-xl border-2 p-3 text-right text-sm transition ${
                    selected === id ? 'border-brand-600 bg-brand-50 font-extrabold' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <span dir="ltr">{q.symbol} · {net}</span>
                  <span className="mt-1 block text-xs font-normal text-slate-500">
                    ≈ {q.perUsd} {q.symbol}/$
                  </span>
                </button>
              );
            }),
          )}
        </div>

        {coin && (
          <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">المبلغ التقريبي بـ {coin.symbol}:</span>
              <b dir="ltr">{(order.totalUsd * coin.perUsd).toFixed(6)} {coin.symbol}</b>
            </div>
            <p className="mt-1 text-xs text-slate-400">يُثبَّت السعر النهائي لمدة 15 دقيقة لحظة إنشاء الفاتورة.</p>
          </div>
        )}

        {err && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{err}</p>}

        <button
          onClick={createInvoice}
          disabled={busy || !coin}
          className="mt-5 w-full rounded-xl bg-brand-600 py-3.5 text-lg font-extrabold text-white shadow hover:bg-brand-700 disabled:opacity-60"
        >
          {busy ? 'جارٍ تثبيت السعر وإنشاء الفاتورة…' : '🪙 إنشاء فاتورة الكريبتو (سعر مثبَّت 15 دقيقة)'}
        </button>
      </div>
      )}

      {/* PHASE 3: invoice panel — QR + exact amount + countdown + confirmations + reveal */}
      {invoice && order && <InvoicePanel invoice={invoice} orderNo={orderNo} email={order.email} />}

      {err && invoice && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{err}</p>}

      <div className="mt-6 flex items-center justify-between text-sm">
        <Link href="/" className="font-bold text-brand-600 hover:underline">← متابعة التسوق</Link>
        <Link href="/track" className="text-slate-500 hover:text-brand-600">تتبع حالة الطلب</Link>
      </div>
    </div>
  );
}
