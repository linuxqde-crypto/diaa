import type { Metadata } from 'next';
import Providers, { SiteFooter, SiteHeader } from '@/components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'كروتو — بطاقات هدايا تُشترى بالكريبتو',
  description: 'متجر كروتو: بطاقات هدايا، تعبئة ألعاب، اشتراكات وقسائم كريبتو — دفع بالعملات الرقمية وتسليم فوري.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="flex min-h-screen flex-col">
        <Providers>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
