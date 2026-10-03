import { notFound } from 'next/navigation';
import ProductPurchaseBox from '@/components/product-purchase-box';
import { api } from '@/lib/api';

export const dynamic = 'force-dynamic';

async function getProduct(slug: string) {
  try {
    return await api.product(slug);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const p = await getProduct(params.slug);
  if (!p) return { title: 'منتج غير موجود — كروتو' };
  return { title: `${p.nameAr} ($${p.priceUsd}) — كروتو` };
}

export default async function ProductPage({ params }: { params: { slug: string } }) {
  const p = await getProduct(params.slug);
  if (!p) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-slate-500">
        <a href="/" className="hover:text-brand-600">الرئيسية</a> ←{' '}
        <a href={`/category/${p.category.slug}`} className="hover:text-brand-600">{p.category.nameAr}</a> ←{' '}
        <span className="font-bold text-slate-700">{p.nameAr}</span>
      </nav>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Visual */}
        <div className="flex h-80 items-center justify-center rounded-3xl border border-slate-200 bg-white shadow-sm">
          {p.imageUrls?.[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.imageUrls[0]} alt={p.nameAr} className="max-h-72 object-contain p-6" />
          ) : (
            <span className="text-8xl">🎁</span>
          )}
        </div>

        {/* Purchase box (client: qty + add-to-cart + buy-now) */}
        <ProductPurchaseBox p={p} />
      </div>

      {/* Description */}
      <section className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="mb-3 text-lg font-extrabold text-slate-800">وصف المنتج</h2>
          <p className="whitespace-pre-line leading-relaxed text-slate-600">
            {p.descriptionAr ?? 'بطاقة رقمية أصلية تُسلَّم إلكترونيًا فور تأكيد الدفع.'}
          </p>
          {p.networkHints.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {p.networkHints.map((n) => (
                <span key={n} className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">
                  {n}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm leading-relaxed text-slate-600">
          <h2 className="mb-3 text-lg font-extrabold text-slate-800">كيف يعمل الشراء؟</h2>
          <ol className="list-inside list-decimal space-y-2">
            <li>اختر الكمية وأضِف المنتج للسلة، ثم أدخل بريدك (شراء كضيف بدون حساب).</li>
            <li>اختر العملة والشبكة — نثبّت سعر الصرف <b>15 دقيقة</b> ونعرض لك المبلغ بالظبط + QR.</li>
            <li>حوّل المبلغ إلى العنوان الفريد؛ نتابع التأكيدات تلقائيًا (BTC:3 · ETH:12 · TRON:20 · SOL:32).</li>
            <li>عند التأكيد الكامل يظهر الكود على الشاشة ويُرسَل لبريدك خلال دقيقتين.</li>
          </ol>
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-amber-900">
            ⚠️ أرسل المبلغ بالظبط. الدفع الأقل يفتح خيار تكميل، والأكثر يُخصَّص كرصيد أو يُرد.
          </p>
        </div>
      </section>

      {/* Related */}
      {p.related.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-xl font-extrabold text-slate-800">منتجات مشابهة</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {p.related.map((r) => (
              <a key={r.slug} href={`/product/${r.slug}`} className="block rounded-2xl border border-slate-200 bg-white p-4 hover:border-brand-500">
                <p className="text-xs font-bold uppercase text-brand-600">{r.brand}</p>
                <p className="mt-1 font-bold text-slate-800">{r.nameAr}</p>
                <p className="mt-1 text-lg font-extrabold">${r.priceUsd.toFixed(2)}</p>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
