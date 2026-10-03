import PayView from '@/components/pay-view';

export const metadata = { title: 'الدفع بالكريبتو — كروتو' };

/** PHASE 3 replaces this placeholder with the real invoice flow (rate lock → provider invoice → QR + countdown). */
export default function PayPage({ params }: { params: { orderNo: string } }) {
  return <PayView orderNo={params.orderNo} />;
}
