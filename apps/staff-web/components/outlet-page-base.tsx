'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getOutlets } from '@/lib/api';
import type { OutletSummary } from '@/lib/types';
import { StaffPageFrame } from './staff-page-frame';
import { useStaffSession } from './staff-session-guard';

export function useOutletContext() {
  const params = useParams<{ outletId: string }>();
  const { session, loading } = useStaffSession();
  const [outlet, setOutlet] = useState<OutletSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!session?.accessToken) {
      return;
    }
    const authToken = session.accessToken;
    let cancelled = false;

    async function load() {
      setBusy(true);
      try {
        const outlets = await getOutlets(authToken);
        const current =
          outlets.find((item) => item.id === params.outletId) ?? null;
        if (!cancelled) {
          if (!current) {
            setError('Outlet not found in this staff session.');
          } else {
            setOutlet(current);
            setError(null);
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Failed to load outlet.',
          );
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [params.outletId, session]);

  return { outletId: params.outletId, session, loading, outlet, error, busy };
}

export function OutletPageLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <StaffPageFrame title={title} subtitle={subtitle}>
      {children}
    </StaffPageFrame>
  );
}

export function OutletHeader({ outlet }: { outlet: OutletSummary }) {
  return (
    <section className="panel section-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Outlet context</p>
          <h2 className="section-title serif">{outlet.name}</h2>
          <p className="supporting-copy">
            {outlet.slug} | {outlet.currency} | {outlet.timezone}
          </p>
        </div>
        <div className="inline-actions">
          <Link
            className="secondary-button"
            href={`/outlets/${outlet.id}/orders`}
          >
            Orders
          </Link>
          <Link className="secondary-button" href={`/outlets/${outlet.id}/kds`}>
            KDS
          </Link>
          <Link
            className="secondary-button"
            href={`/outlets/${outlet.id}/tables`}
          >
            Tables
          </Link>
          <Link
            className="secondary-button"
            href={`/outlets/${outlet.id}/menus`}
          >
            Menus
          </Link>
          <Link
            className="secondary-button"
            href={`/outlets/${outlet.id}/inventory`}
          >
            Inventory
          </Link>
          <Link
            className="secondary-button"
            href={`/outlets/${outlet.id}/staff`}
          >
            Staff
          </Link>
          <Link
            className="secondary-button"
            href={`/outlets/${outlet.id}/attendance`}
          >
            Attendance
          </Link>
          <Link
            className="secondary-button"
            href={`/outlets/${outlet.id}/printing`}
          >
            Printing
          </Link>
          <Link className="secondary-button" href={`/outlets/${outlet.id}/pos`}>
            POS
          </Link>
        </div>
      </div>
    </section>
  );
}
