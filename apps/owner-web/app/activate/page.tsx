import { Suspense } from 'react';
import { ActivatePage } from '@/components/activate-page';

export default function OwnerActivatePage() {
  return (
    <Suspense fallback={null}>
      <ActivatePage />
    </Suspense>
  );
}
