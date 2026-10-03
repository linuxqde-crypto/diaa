'use client';

import { useState } from 'react';
import { api, errText } from '@/lib/api';
import type { TrackResult } from '@/lib/types';

const STATUS_AR: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'بانتظار الدفع', cls: 'bg-amber-100 text-amber-800' },
  PAID: { label: 'مدفوع — قيد التسليم', cls: 'bg-sky-100 text-sky-800' },
  CONFIRMED: { label: 'مؤكد', cls: 'bg-emerald-100 text-emerald-800' },
  DELIVERED: { label: 'تم التسليم ✓', cls: 'bg-emerald-100 text-emerald-800' },
  UNDERPAID: { label: 'دفع ناقص', cls: 'bg-orange-100 text-orange-800' },
  EXPIRED: { label: 'انتهت الفاتورة', cls: 'bg-rose-100 text-rose-800' },
  CANCELLED: { label: 'ملغي', cls: 'bg-slate-100 text-slate-600' },
  REFUNDED: { label: 'تم الاسترجاع', cls: 'bg-violet-100 text-violet-800' },
};

/** Guest order tracking — orderNo + email (never exposes codes before delivery). */
export default function TrackForm() {
  const [orderNo, setOrderNo] = useState('');
  const [email, setEmail] = useState('');
  const [res, setRes] = useState<TrackResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    setRes(null);
    try {
      const r = await api.track(orderNo.trim(), email.trim());
      if ((r as { error?: string }).error) setErr((r as { error: string }).error);
      else setRes(r);
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-center text-2xl font-extrabold text-slate-800">🔎 تتبع طلبك</h1>
      <p className="mt-2 text-center text-sm text-slate-500">
        أدخل رقم الطلب (مثل KRT-2026-000123) والبريد المستخدم عند الشراء.
      </p>

      <div className="mt-6 space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <input
          dir="ltr"
          value={orderNo}
          onChange={(e) => setOrderNo(e.target.value)}
          placeholder="KRT-2026-XXXXXX"
          className="w-full rounded-xl border border-slate-300 px-4 py-2.5 focus:border-brand-500 focus:outline-none"
        />
        <input
          dir="ltr"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="بريدك الإلكتروني"
          className="w-full rounded-xl border border-slate-300 px-4 py-2.5 focus:border-brand-500 focus:outline-none"
        />
        <button
          onClick={submit}
          disabled={busy || !orderNo || !email}
          className="w-full rounded-xl bg-brand-600 py-3 font-extrabold text-white hover:bg-brand-700 disabled:bg-slate-300"
        >
          {busy ? 'جارٍ البحث…' : 'تتبع'}
        </button>
      </div>

      {err && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{err}</p>}

      {res && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="font-extrabold" dir="ltr">{res.orderNo}</p>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_AR[res.status]?.cls ?? 'bg-slate-100 text-slate-600'}`}>
              {STATUS_AR[res.status]?.label ?? res.status}
            </span>
          </div>
          {res.items && (
            <ul className="mt-3 space-y-1 text-sm text-slate-600">
              {res.items.map((i, n) => (
                <li key={n}>• {i.name} ×{i.quantity}</li>
              ))}
            </ul>
          )}
          {res.totalUsd !== undefined && (
            <p className="mt-2 text-sm font-bold text-slate-700">الإجمالي: ${res.totalUsd.toFixed(2)}</p>
          )}
          {res.status === 'PENDING' && (
            <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              إذا لم تكن دفعت بعد، تابع من صفحة الدفع التي فتحها المتصفح — أو أعد الطلب من السلة إن أغلقتها.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
