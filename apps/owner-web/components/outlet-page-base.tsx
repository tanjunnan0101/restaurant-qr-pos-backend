'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getOutlets } from '@/lib/api';
import type { OutletSummary } from '@/lib/types';
import { OwnerPageFrame } from './owner-page-frame';
import { useOwnerSession } from './owner-session-guard';

export function useOutletContext() {
  const params = useParams<{ outletId: string }>();
  const { session, loading } = useOwnerSession();
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
            setError('Outlet not found in this owner session.');
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
    <OwnerPageFrame title={title} subtitle={subtitle}>
      {children}
    </OwnerPageFrame>
  );
}

export function OutletHeader({ outlet }: { outlet: OutletSummary }) {
  return (
    <section className="section-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Outlet context</p>
          <h2 className="serif">{outlet.name}</h2>
          <p>
            {outlet.slug} • {outlet.currency} • {outlet.timezone}
          </p>
        </div>
        <div className="inline-actions">
          <Link
            className="secondary-button"
            href={`/outlets/${outlet.id}/menu`}
          >
            Menu
          </Link>
          <Link
            className="secondary-button"
            href={`/outlets/${outlet.id}/tables`}
          >
            Tables
          </Link>
          <Link
            className="secondary-button"
            href={`/outlets/${outlet.id}/payment-settings`}
          >
            Payment settings
          </Link>
          <Link
            className="secondary-button"
            href={`/outlets/${outlet.id}/printing`}
          >
            Printing
          </Link>
        </div>
      </div>
    </section>
  );
}
