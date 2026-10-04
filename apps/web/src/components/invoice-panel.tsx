'use client';

import { QRCodeSVG } from 'qrcode.react';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, errText } from '@/lib/api';
import type { InvoiceView, RevealResult } from '@/lib/types';

const NETWORK_LABELS: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum (ERC20)',
  TRON: 'Tron (TRC20)',
  SOLANA: 'Solana',
  BNB_CHAIN: 'BNB Smart Chain (BEP20)',
};

function msLeft(iso: string): number {
  return Math.max(0, new Date(iso).getTime() - Date.now());
}

function fmtCountdown(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * PHASE 3 payment panel — the heart of the crypto flow UI:
 * exact amount + unique address + QR + live 15-min countdown + confirmation tracker.
 * Polls the invoice status endpoint (webhooks are the source of truth; polling only mirrors DB state).
 * Handles every edge case the API can produce: UNDERPAID (top-up/refund address),
 * OVERPAID (note), EXPIRED (re-quote button), CONFIRMED (on-screen code reveal).
 */
export default function InvoicePanel({
  invoice: initial,
  orderNo,
  email,
}: {
  invoice: InvoiceView;
  orderNo: string;
  email: string;
}) {
  const [inv, setInv] = useState<InvoiceView>(initial);
  const [token, setToken] = useState<string>(initial.accessToken ?? '');
  const [now, setNow] = useState(() => Date.now());
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<'address' | 'amount' | null>(null);
  const [reveal, setReveal] = useState<RevealResult | null>(null);
  const [refundAddr, setRefundAddr] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Persist access token so a page refresh keeps the invoice viewable.
  useEffect(() => {
    if (initial.accessToken) {
      try {
        sessionStorage.setItem(`kroto.inv.${orderNo}`, initial.accessToken);
      } catch { /* private mode */ }
    } else if (!token) {
      try {
        const t = sessionStorage.getItem(`kroto.inv.${orderNo}`);
        if (t) setToken(t);
      } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.accessToken, orderNo]);

  // 1-second clock for the countdown.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Status polling: 4s while open, stops on terminal states.
  const poll = useCallback(async () => {
    if (!token) return;
    try {
      const next = await api.invoiceStatus(inv.invoiceNo, token);
      setInv((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    } catch {
      /* transient network errors: keep last known state */
    }
  }, [inv.invoiceNo, token]);

  useEffect(() => {
    const terminal = inv.status === 'CONFIRMED' || inv.status === 'EXPIRED' || inv.status === 'REFUND_ISSUED';
    if (terminal) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    if (!timerRef.current && token) {
      timerRef.current = setInterval(poll, 4000);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [inv.status, token, poll]);

  // On CONFIRMED → fetch codes for on-screen reveal (email copy is sent server-side too).
  useEffect(() => {
    if (inv.status === 'CONFIRMED' && !reveal?.ready) {
      api.revealCodes(orderNo, email).then(setReveal).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inv.status]);

  const deadline = inv.expiresAt;
  const remaining = msLeft(deadline);
  const expired = remaining <= 0 && (inv.status === 'PENDING' || inv.status === 'UNDERPAID');

  const copy = async (what: 'address' | 'amount', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch { /* clipboard blocked */ }
  };

  const doRequote = async () => {
    setBusy(true);
    setErr(null);
    try {
      const fresh = await api.requote(inv.invoiceNo, token);
      setInv(fresh);
      if (fresh.accessToken) {
        setToken(fresh.accessToken);
        try {
          sessionStorage.setItem(`kroto.inv.${orderNo}`, fresh.accessToken);
        } catch { /* ignore */ }
      }
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const doDemoSettle = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.demoSettle(inv.invoiceNo, token);
      if (!r.ok) setErr(r.message ?? 'تعذرت المحاكاة');
      setTimeout(poll, 800);
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const doRefundAddress = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.submitRefundAddress(inv.invoiceNo, token, refundAddr);
      if (r.error) setErr(r.error);
      else {
        setRefundAddr('');
        setErr(null);
        alert('تم حفظ عنوان الاسترداد — سيردّ فريق المالية الفارق خلال ساعات العمل.');
      }
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const statusBadge = (() => {
    switch (inv.status) {
      case 'PENDING':
        return <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">بانتظار الدفع</span>;
      case 'PAID':
      case 'OVERPAID':
        return <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-800">تم استلام الدفع — جارٍ التأكيد</span>;
      case 'UNDERPAID':
        return <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-800">مبلغ ناقص</span>;
      case 'CONFIRMED':
        return <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">✓ مؤكد ومُسلَّم</span>;
      case 'EXPIRED':
        return <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-700">منتهية الصلاحية</span>;
      default:
        return <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{inv.status}</span>;
    }
  })();

  const confOk = inv.confirmations >= inv.requiredConfirmations;

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-extrabold text-slate-800">فاتورة الدفع <span dir="ltr" className="text-brand-700">{inv.invoiceNo}</span></h2>
        {statusBadge}
      </div>

      {/* Countdown / expiry */}
      {(inv.status === 'PENDING' || inv.status === 'UNDERPAID') && (
        <div className={`mt-4 flex items-center justify-between rounded-xl px-4 py-3 ${remaining < 120_000 && remaining > 0 ? 'bg-rose-50' : 'bg-slate-50'}`}>
          <span className="text-sm font-bold text-slate-600">⏳ السعر مثبَّت — الوقت المتبقي للدفع:</span>
          <span dir="ltr" className={`font-mono text-lg font-extrabold ${remaining < 120_000 ? 'text-rose-600 animate-pulse' : 'text-slate-800'}`}>
            {fmtCountdown(remaining)}
          </span>
        </div>
      )}

      {/* Amount + address + QR */}
      {inv.address && (
        <div className="mt-4 grid gap-4 sm:grid-cols-[auto_1fr]">
          <div className="mx-auto rounded-xl border-2 border-slate-200 bg-white p-3">
            <QRCodeSVG
              value={inv.paymentUri || `${inv.address}`}
              size={168}
              level="M"
            />
          </div>
          <div className="space-y-3 text-sm">
            <div className="rounded-xl bg-brand-50 p-3">
              <p className="text-xs font-bold text-brand-700">المبلغ المطلوب بالضبط ({NETWORK_LABELS[inv.network] ?? inv.network})</p>
              <button onClick={() => copy('amount', inv.cryptoAmount)} dir="ltr" className="mt-1 block w-full text-right font-mono text-xl font-extrabold text-slate-900 hover:text-brand-700">
                {inv.cryptoAmount} {inv.currency}
              </button>
              <p className="mt-1 text-[11px] text-slate-500">
                {copied === 'amount' ? '✓ تم النسخ' : 'اضغط للنسخ'} • السعر المثبَّت: {Number(inv.rateUsd).toLocaleString('en-US')} $/{inv.currency}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-bold text-slate-500">عنوان الإرسال — حوّل لهذا العنوان فقط</p>
              <button onClick={() => copy('address', inv.address!)} dir="ltr" className="mt-1 block w-full break-all text-right font-mono text-xs font-bold text-slate-800 hover:text-brand-700">
                {inv.address}
              </button>
              <p className="mt-1 text-[11px] text-slate-500">{copied === 'address' ? '✓ تم النسخ' : 'اضغط للنسخ'}</p>
            </div>
            {inv.paidAmount && (
              <p className="text-xs text-slate-500" dir="ltr">Received: {inv.paidAmount} {inv.currency}</p>
            )}
          </div>
        </div>
      )}

      {/* Confirmation progress */}
      {(inv.status === 'PAID' || inv.status === 'OVERPAID' || inv.status === 'UNDERPAID' || inv.status === 'CONFIRMED') && (
        <div className="mt-4 rounded-xl bg-slate-50 p-4">
          <div className="flex items-center justify-between text-sm font-bold">
            <span className="text-slate-600">التأكيدات على الشبكة</span>
            <span className={confOk ? 'text-emerald-600' : 'text-amber-600'}>
              {inv.confirmations} / {inv.requiredConfirmations} {confOk ? '✓' : ''}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full transition-all duration-700 ${confOk ? 'bg-emerald-500' : 'bg-amber-400'}`}
              style={{ width: `${Math.min(100, (inv.confirmations / Math.max(1, inv.requiredConfirmations)) * 100)}%` }}
            />
          </div>
          {inv.txHash && (
            <p className="mt-2 truncate text-[11px] text-slate-400" dir="ltr">tx: {inv.txHash}</p>
          )}
        </div>
      )}

      {/* ── Edge cases ── */}
      {inv.status === 'UNDERPAID' && inv.underpayDelta && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm">
          <p className="font-extrabold text-rose-800">استلمنا مبلغًا أقل من المطلوب — الفارق: <span dir="ltr">{inv.underpayDelta} {inv.currency}</span></p>
          <p className="mt-1 text-rose-700">
            لديك خياران: (1) إرسال الفارق إلى نفس العنوان قبل انتهاء العدّاد ليُحتسب الدفع كاملًا،
            أو (2) حفظ عنوان محفظة لاسترداد ما دفعته سابقًا.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              value={refundAddr}
              onChange={(e) => setRefundAddr(e.target.value)}
              placeholder="عنوان محفظتك للاسترداد"
              dir="ltr"
              className="min-w-0 flex-1 rounded-lg border border-rose-200 bg-white px-3 py-2 font-mono text-xs focus:border-rose-400 focus:outline-none"
            />
            <button onClick={doRefundAddress} disabled={busy || refundAddr.trim().length < 10} className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
              احفظ عنوان الاسترداد
            </button>
          </div>
        </div>
      )}

      {inv.status === 'OVERPAID' && inv.overpayDelta && (
        <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
          <p className="font-extrabold">استلمنا مبلغًا زائدًا — الفارق: <span dir="ltr">{inv.overpayDelta} {inv.currency}</span></p>
          <p className="mt-1">طلبك سيُسلَّم فور اكتمال التأكيدات، والفارق يُحوَّل لرصيد متجرك أو يُرد حسب سياسة الأدمن.</p>
        </div>
      )}

      {(inv.status === 'EXPIRED' || expired) && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="font-extrabold text-amber-900">انتهت صلاحية الفاتورة (لم يصل دفع خلال المهلة).</p>
          <p className="mt-1 text-amber-800">لا تقلق — طلبك ما زال محفوظًا. اضغط لإعادة التسعير بسعر لحظي جديد وفاتورة بـ 15 دقيقة إضافية.</p>
          <button onClick={doRequote} disabled={busy} className="mt-3 rounded-lg bg-amber-600 px-5 py-2 text-sm font-extrabold text-white hover:bg-amber-700 disabled:opacity-50">
            🔄 إعادة التسعير الآن
          </button>
        </div>
      )}

      {/* ── Delivered: on-screen reveal ── */}
      {inv.status === 'CONFIRMED' && (
        <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4">
          <p className="font-extrabold text-emerald-800">🎉 تم تأكيد الدفع وتُسليم الأكواد — أُرسلت أيضًا إلى بريدك <b dir="ltr">{email}</b></p>
          {reveal?.ready ? (
            <ul className="mt-3 space-y-3">
              {reveal.items?.map((it, n) => (
                <li key={n}>
                  <p className="text-sm font-bold text-slate-700">{it.nameAr} ×{it.quantity}</p>
                  {it.codes.map((c, k) => (
                    <div key={k} className="mt-1 flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2">
                      <code dir="ltr" className="flex-1 break-all font-mono text-sm font-extrabold text-slate-900">{c}</code>
                      <button
                        onClick={() => navigator.clipboard?.writeText(c)}
                        className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white"
                      >
                        نسخ
                      </button>
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-emerald-700">جارٍ جلب الأكواد…</p>
          )}
        </div>
      )}

      {/* Demo helper when BTCPay isn't configured yet (local docker smoke test) */}
      {inv.demoMode && inv.status === 'PENDING' && (
        <div className="mt-4 rounded-xl border border-dashed border-violet-300 bg-violet-50 p-4 text-sm">
          <p className="font-bold text-violet-800">🧪 وضع التجربة المحلي (BTCPay غير مُهيأ على هذا السيرفر)</p>
          <p className="mt-1 text-violet-700">للتحقق من الدورة الكاملة (Webhook موقَّع محليًا ← تأكيد ← تسليم ← إيميل):</p>
          <button onClick={doDemoSettle} disabled={busy} className="mt-2 rounded-lg bg-violet-600 px-5 py-2 text-sm font-extrabold text-white hover:bg-violet-700 disabled:opacity-50">
            ▶️ محاكاة الدفع الكامل
          </button>
        </div>
      )}

      {err && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{err}</p>}

      <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
        <span>تحديث تلقائي كل 4 ثوانٍ • Webhook هو مصدر الحقيقة</span>
        <Link href="/track" className="font-bold text-brand-600 hover:underline">تتبع الطلب</Link>
      </div>
    </div>
  );
}
