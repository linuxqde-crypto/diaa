import Link from 'next/link';
import HeaderNav from './header-nav';
import { CartProvider } from '@/lib/cart';

export default function Providers({ children }: { children: React.ReactNode }) {
  return <CartProvider>{children}</CartProvider>;
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-xl font-extrabold text-brand-700">
          🎁 كروتو
        </Link>
        <nav className="hidden items-center gap-4 text-sm font-medium text-slate-600 md:flex">
          <Link href="/category/steam-cards" className="hover:text-brand-600">بطاقات ستيم</Link>
          <Link href="/category/game-topups" className="hover:text-brand-600">تعبئة ألعاب</Link>
          <Link href="/category/subscriptions" className="hover:text-brand-600">اشتراكات</Link>
          <Link href="/category/crypto-vouchers" className="hover:text-brand-600">قسائم كريبتو</Link>
        </nav>
        <div className="ms-auto">
          <HeaderNav />
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 py-8 text-center text-sm text-slate-500">
        <p className="font-bold text-brand-700">🎁 كروتو — بطاقات هدايا تُشترى بالكريبتو</p>
        <p>الدفع بالعملات الرقمية فقط · تسليم فوري عبر البريد بعد تأكيد الشبكة</p>
        <p className="text-xs">لا نحتفظ بمفاتيح خاصة · سجل تدقيق مالي غير قابل للتعديل · حماية 2FA للإدارة</p>
      </div>
    </footer>
  );
}
