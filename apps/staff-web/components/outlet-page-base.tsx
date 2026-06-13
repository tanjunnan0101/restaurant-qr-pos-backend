'use client';

import { useParams, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ClipboardList,
  Clock3,
  MenuSquare,
  Package,
  Printer,
  ScanLine,
  SquareTerminal,
  Store,
  Users,
} from 'lucide-react';
import { getOutlets } from '@/lib/api';
import type { OutletSummary } from '@/lib/types';
import { StaffPageFrame } from './staff-page-frame';
import { useStaffSession } from './staff-session-guard';

const workspaceRouteItems = [
  { href: 'pos', label: 'POS', icon: SquareTerminal },
  { href: 'orders', label: 'Orders', icon: ClipboardList },
  { href: 'tables', label: 'Tables', icon: Store },
  { href: 'kds', label: 'Kitchen', icon: ScanLine },
  { href: 'menus', label: 'Menus', icon: MenuSquare },
  { href: 'inventory', label: 'Inventory', icon: Package },
  { href: 'attendance', label: 'Attendance', icon: Clock3 },
  { href: 'printing', label: 'Printing', icon: Printer },
  { href: 'staff', label: 'Team', icon: Users },
];

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
  const activeWorkspace =
    workspaceRouteItems.find((item) => pathname.endsWith(`/${item.href}`)) ?? null;
  const ActiveWorkspaceIcon = activeWorkspace?.icon;

  return (
    <section className="outlet-terminal-bar">
      <div className="outlet-terminal-bar__identity">
        <div className="outlet-terminal-bar__primary">
          <p className="eyebrow">Outlet</p>
          <h2 className="outlet-terminal-bar__title">{outlet.name}</h2>
          <p className="supporting-copy">
            {outlet.slug} | {outlet.currency} | {outlet.timezone}
          </p>
        </div>
        <div className="outlet-terminal-bar__tools">
          {activeWorkspace && ActiveWorkspaceIcon ? (
            <span className="workspace-pill workspace-pill--terminal current compact">
              <ActiveWorkspaceIcon aria-hidden="true" size={16} />
              <span>{activeWorkspace.label}</span>
            </span>
          ) : (
            <span className="workspace-pill workspace-pill--terminal compact">
              <SquareTerminal aria-hidden="true" size={16} />
              <span>Outlet tools</span>
            </span>
          )}
          <div className="outlet-terminal-bar__stats">
            <article className="command-pill">
              <span>GST</span>
              <strong>
                {outlet.gstEnabled ? `${outlet.gstRateBps / 100}%` : 'Off'}
              </strong>
            </article>
            <article className="command-pill">
              <span>Service</span>
              <strong>
                {outlet.serviceChargeEnabled
                  ? `${outlet.serviceChargeBps / 100}%`
                  : 'Off'}
              </strong>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}
