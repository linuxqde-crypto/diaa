'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import ProductCard from '@/components/product-card';
import { api, errText } from '@/lib/api';
import type { CategorySummary, Paged, ProductListItem } from '@/lib/types';

/** Shared browse grid used by /search and /category/[slug]. */
export default function CatalogBrowser({ fixedCategory }: { fixedCategory?: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const search = sp.get('q') ?? '';
  const sort = sp.get('sort') ?? 'newest';
  const page = Math.max(1, Number(sp.get('page') ?? 1));
  const category = fixedCategory ?? sp.get('cat') ?? '';

  const [cats, setCats] = useState<CategorySummary[]>([]);
  const [data, setData] = useState<Paged<ProductListItem> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.categories().then(setCats).catch(() => {});
  }, []);

  useEffect(() => {
    let live = true;
    setError(null);
    api
      .products({ category, search, sort, page })
      .then((d) => live && setData(d))
      .catch((e) => live && setError(errText(e)));
    return () => {
      live = false;
    };
  }, [category, search, sort, page]);

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page'); // filters reset pagination
    router.push(`/search?${next.toString()}`);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-extrabold text-slate-800">كل المنتجات</h1>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          defaultValue={search}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setParam('q', (e.target as HTMLInputElement).value.trim());
          }}
          placeholder="ابحث بالاسم أو الماركة… (اضغط Enter)"
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm focus:border-brand-500 focus:outline-none md:w-72"
        />
        <select
          value={sort}
          onChange={(e) => setParam('sort', e.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="newest">الأحدث</option>
          <option value="price_asc">السعر: من الأقل</option>
          <option value="price_desc">السعر: من الأعلى</option>
        </select>
        {!fixedCategory && (
          <select
            value={category}
            onChange={(e) => setParam('cat', e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">كل التصنيفات</option>
            {cats.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.nameAr}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className="mt-6 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>
      )}

      {data && data.items.length === 0 && !error && (
        <p className="mt-10 text-center text-slate-500">لا توجد منتجات مطابقة لبحثك 🙁</p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {data?.items.map((p) => (
          <ProductCard key={p.id} p={p} />
        ))}
      </div>

      {/* Pagination */}
      {data && data.meta.pages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2 text-sm">
          {Array.from({ length: data.meta.pages }, (_, i) => i + 1).map((n) => (
            <Link
              key={n}
              href={`/search?${new URLSearchParams({ ...(fixedCategory ? { cat: fixedCategory } : {}), q: search, sort, page: String(n) }).toString()}`}
              className={`rounded-lg px-3 py-1.5 font-bold ${
                n === data.meta.page ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              {n}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function CatalogBrowserSuspense(props: { fixedCategory?: string }) {
  return (
    <Suspense fallback={<p className="py-16 text-center text-slate-400">جارٍ التحميل…</p>}>
      <CatalogBrowser {...props} />
    </Suspense>
  );
}
