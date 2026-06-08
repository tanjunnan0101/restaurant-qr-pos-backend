'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
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
  const pathname = usePathname();
  const navItems = [
    { href: `/outlets/${outlet.id}/reports`, label: 'Reports' },
    { href: `/outlets/${outlet.id}/settings`, label: 'Settings' },
    { href: `/outlets/${outlet.id}/menu`, label: 'Menu' },
    { href: `/outlets/${outlet.id}/tables`, label: 'Tables' },
    { href: `/outlets/${outlet.id}/inventory`, label: 'Inventory' },
    { href: `/outlets/${outlet.id}/payment-settings`, label: 'Payments' },
    { href: `/outlets/${outlet.id}/staff`, label: 'Staff' },
    { href: `/outlets/${outlet.id}/attendance`, label: 'Attendance' },
    { href: `/outlets/${outlet.id}/audit`, label: 'Audit' },
    { href: `/outlets/${outlet.id}/printing`, label: 'Printing' },
  ];

  return (
    <section className="section-panel workspace-hero">
      <div className="workspace-hero__header">
        <div className="workspace-hero__copy">
          <p className="eyebrow">Outlet context</p>
          <h2 className="serif">{outlet.name}</h2>
          <p>{outlet.slug} | {outlet.currency} | {outlet.timezone}</p>
        </div>

        <div className="workspace-meta-grid">
          <article className="info-card info-card--compact">
            <span className="metric-label">GST</span>
            <span className="metric-value">
              {outlet.gstEnabled ? `${outlet.gstRateBps / 100}%` : 'Off'}
            </span>
            <p className="metric-note">Tax configuration for this outlet.</p>
          </article>
          <article className="info-card info-card--compact">
            <span className="metric-label">Service charge</span>
            <span className="metric-value">
              {outlet.serviceChargeEnabled
                ? `${outlet.serviceChargeBps / 100}%`
                : 'Off'}
            </span>
            <p className="metric-note">Applied before QR and POS settlement.</p>
          </article>
        </div>
      </div>

      <div className="workspace-pill-grid">
        {navItems.map((item) => {
          const current =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              className={current ? 'workspace-pill current' : 'workspace-pill'}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
