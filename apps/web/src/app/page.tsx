/**
 * PHASE 1 placeholder. The full RTL storefront (catalog, cart, checkout) ships in PHASE 2.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-4xl font-extrabold text-brand-700">🎁 كروتو</h1>
      <p className="text-lg text-slate-600">
        متجر بطاقات الهدايا الرقمي — ادفع بالكريبتو واستلم الكود فورًا.
      </p>
      <p className="rounded-xl bg-amber-100 px-4 py-2 text-sm text-amber-800">
        واجهة المتجر الكاملة تصل في المرحلة الثانية (PHASE 2). البنية التحتية وقاعدة البيانات جاهزة الآن.
      </p>
    </main>
  );
}
