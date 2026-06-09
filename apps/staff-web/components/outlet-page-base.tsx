'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
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
  const pathname = usePathname();
  const navItems = [
    { href: `/outlets/${outlet.id}/orders`, label: 'Orders' },
    { href: `/outlets/${outlet.id}/kds`, label: 'KDS' },
    { href: `/outlets/${outlet.id}/tables`, label: 'Tables' },
    { href: `/outlets/${outlet.id}/menus`, label: 'Menus' },
    { href: `/outlets/${outlet.id}/inventory`, label: 'Inventory' },
    { href: `/outlets/${outlet.id}/staff`, label: 'Staff' },
    { href: `/outlets/${outlet.id}/attendance`, label: 'Attendance' },
    { href: `/outlets/${outlet.id}/printing`, label: 'Printing' },
    { href: `/outlets/${outlet.id}/pos`, label: 'POS' },
  ];

  return (
    <section className="panel section-panel outlet-command-bar">
      <div className="outlet-command-bar__header">
        <div className="outlet-command-bar__identity">
          <p className="eyebrow">Outlet</p>
          <h2 className="section-title serif">{outlet.name}</h2>
          <p className="supporting-copy">
            {outlet.slug} | {outlet.currency}
          </p>
        </div>
        <div className="outlet-command-bar__meta">
          <article className="sub-panel outlet-chip">
            <span className="metric-label">GST</span>
            <strong>
              {outlet.gstEnabled ? `${outlet.gstRateBps / 100}%` : 'Off'}
            </strong>
          </article>
          <article className="sub-panel outlet-chip">
            <span className="metric-label">Service</span>
            <strong>
              {outlet.serviceChargeEnabled
                ? `${outlet.serviceChargeBps / 100}%`
                : 'Off'}
            </strong>
          </article>
          <article className="sub-panel outlet-chip">
            <span className="metric-label">Timezone</span>
            <strong>{outlet.timezone}</strong>
          </article>
        </div>
      </div>

      <div className="outlet-command-bar__nav">
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
