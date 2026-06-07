import { Suspense } from 'react';
import { PaymentResult } from '@/components/payment-result';

export default async function PaymentSuccessPage({
  params,
}: {
  params: Promise<{ publicCode: string; token: string }>;
}) {
  const route = await params;
  return (
    <Suspense fallback={<div className="page-loader">Checking payment...</div>}>
      <PaymentResult {...route} mode="success" />
    </Suspense>
  );
}
