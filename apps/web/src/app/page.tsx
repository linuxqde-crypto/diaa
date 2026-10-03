import ProductCard from '@/components/product-card';
import { api } from '@/lib/api';

export const dynamic = 'force-dynamic'; // catalog is live (stock badges must not go stale)

async function getData() {
  try {
    const [featured, categories] = await Promise.all([api.featured(8), api.categories()]);
    return { featured, categories, offline: false as const };
  } catch {
    return { featured: [], categories: [], offline: true as const };
  }
}

export default async function HomePage() {
  const { featured, categories, offline } = await getData();

  return (
    <div className="mx-auto max-w-6xl px-4">
      {/* Hero */}
      <section className="mt-8 rounded-3xl bg-gradient-to-l from-brand-700 to-brand-500 p-10 text-white shadow-lg">
        <h1 className="text-3xl font-extrabold md:text-4xl">ادفع بالكريبتو… واستلم الكود فور التأكيد 🎁</h1>
        <p className="mt-3 max-w-2xl text-brand-50">
          بطاقات ستيم، تعبئة ألعاب، اشتراكات وقسائم كريبتو — BTC · ETH · USDT (TRC20/ERC20) · SOL · BNB.
          أسعار مثبتة لمدة 15 دقيقة وتسليم آمن عبر البريد.
        </p>
        <a
          href="#catalog"
          className="mt-6 inline-block rounded-xl bg-white px-6 py-3 font-bold text-brand-700 shadow hover:bg-brand-50"
        >
          تصفّح المنتجات ↓
        </a>
      </section>

      {offline && (
        <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          ⚠️ تعذّر الاتصال بخدمة الكتالوج حاليًا — شغّل الـ API (<code dir="ltr">docker compose up -d api</code>) ثم حدّث الصفحة.
        </div>
      )}

      {/* Categories */}
      {categories.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-xl font-extrabold text-slate-800">التصنيفات</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {categories.map((c) => (
              <a
                key={c.id}
                href={`/category/${c.slug}`}
                className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm transition hover:border-brand-500 hover:shadow"
              >
                <span className="text-3xl">{c.icon ?? '🗂️'}</span>
                <span className="font-bold text-slate-800">{c.nameAr}</span>
                <span className="text-xs text-slate-500">{c._count.products} منتج</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Featured */}
      <section id="catalog" className="mt-10 scroll-mt-20">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-slate-800">الأكثر مبيعًا</h2>
          <a href="/search" className="text-sm font-bold text-brand-600 hover:underline">عرض الكل ←</a>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((p) => (
            <ProductCard key={p.id} p={p} />
          ))}
        </div>
      </section>

      {/* Trust strip */}
      <section className="mt-12 grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
        {[
          ['🔐', 'لا مفاتيح خاصة لدينا', 'حفظ الأموال لدى BTCPay Server — المتجر لا يلمس أي seed phrase أبدًا.'],
          ['⚡', 'تسليم خلال دقيقتين', 'بمجرد اكتمال تأكيدات الشبكة (مثل 20 لترون) يصلك الكود على الشاشة والبريد.'],
          ['🧾', 'سجل تدقيق مالي كامل', 'كل webhook وكل عملية مالية تُسجَّل بشكل غير قابل للتعديل ويمكن إعادة تشغيلها بأمان.'],
        ].map(([icon, title, body]) => (
          <div key={title} className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-2xl">{icon}</p>
            <p className="mt-2 font-extrabold text-slate-800">{title}</p>
            <p className="mt-1 text-slate-500">{body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
