import { Suspense } from 'react';
import { PaymentResult } from '@/components/payment-result';

export default async function PaymentCancelPage({
  params,
}: {
  params: Promise<{ publicCode: string; token: string }>;
}) {
  const route = await params;
  return (
    <Suspense fallback={<div className="page-loader">Loading order...</div>}>
      <PaymentResult {...route} mode="cancel" />
    </Suspense>
  );
}
