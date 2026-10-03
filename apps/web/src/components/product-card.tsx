import type { ProductListItem } from '@/lib/types';
import ProductCardClient from './product-card-client';

/** Server component wrapper — keeps the card itself light & client-only for the add button. */
export default function ProductCard({ p }: { p: ProductListItem }) {
  return <ProductCardClient p={p} />;
}
