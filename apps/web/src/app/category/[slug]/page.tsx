import { notFound } from 'next/navigation';
import { CatalogBrowserSuspense } from '@/components/catalog-browser';
import { api } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { slug: string } }) {
  try {
    const cats = await api.categories();
    const c = cats.find((x) => x.slug === params.slug);
    return { title: c ? `${c.nameAr} — كروتو` : 'تصنيف — كروتو' };
  } catch {
    return { title: 'تصنيف — كروتو' };
  }
}

export default async function CategoryPage({ params }: { params: { slug: string } }) {
  try {
    const cats = await api.categories();
    if (!cats.some((c) => c.slug === params.slug)) notFound();
  } catch {
    /* API offline → the browser component will surface the error itself */
  }
  return <CatalogBrowserSuspense fixedCategory={params.slug} />;
}
