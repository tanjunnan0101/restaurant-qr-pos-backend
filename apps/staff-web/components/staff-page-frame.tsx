'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import {
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Package,
  Printer,
  ScanLine,
  SquareTerminal,
  Store,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useStaffSession } from './staff-session-guard';

const primaryLinks = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
  },
];

const outletLinks = [
  {
    slug: 'orders',
    label: 'Orders',
    icon: ClipboardList,
  },
  {
    slug: 'kds',
    label: 'Kitchen',
    icon: ScanLine,
  },
  {
    slug: 'tables',
    label: 'Tables',
    icon: Store,
  },
  {
    slug: 'pos',
    label: 'POS',
    icon: SquareTerminal,
  },
  {
    slug: 'inventory',
    label: 'Inventory',
    icon: Package,
  },
  {
    slug: 'printing',
    label: 'Printing',
    icon: Printer,
  },
  {
    slug: 'staff',
    label: 'Team',
    icon: Users,
  },
];

export function StaffPageFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { session, loading, signOut } = useStaffSession();

  if (loading || !session) {
    return (
      <main className="staff-shell loading-shell">
        <section className="hero-card compact-card">
          <p className="eyebrow">Staff Console</p>
          <h1 className="display-title serif">
            Opening the live service board...
          </h1>
          <p className="supporting-copy">
            We are checking your saved session and loading your permitted
            outlets.
          </p>
        </section>
      </main>
    );
  }

  const currentOutletId =
    pathname.match(/\/outlets\/([^/]+)/)?.[1] ?? session.user.outlets[0]?.id;
  const currentOutlet = session.user.outlets.find(
    (outlet) => outlet.id === currentOutletId,
  );

  return (
    <main className="staff-shell">
      <div className="staff-page-layout">
        <aside className="staff-sidebar staff-sidebar--rich">
          <Link className="sidebar-brand sidebar-brand--staff" href="/dashboard">
            <span className="sidebar-brand__mark sidebar-brand__mark--staff">
              <SquareTerminal aria-hidden="true" size={20} />
            </span>
            <span className="sidebar-brand__copy">
              <strong>Sakorio Staff</strong>
              <small>Live service, cashier, and floor tools</small>
            </span>
          </Link>

          <div className="sidebar-block sidebar-profile">
            <div>
              <p className="eyebrow">Operator</p>
              <h2 className="sidebar-title serif">{session.user.fullName}</h2>
              <p className="supporting-copy">{session.user.email}</p>
            </div>
            <div className="profile-metrics">
              <article className="sub-panel sub-panel--soft">
                <span className="metric-label">Shift scope</span>
                <strong className="metric-value">
                  {session.user.outlets.length}
                </strong>
                <p className="supporting-copy">Outlets linked to this login.</p>
              </article>
            </div>
          </div>

          <nav className="sidebar-nav sidebar-nav--stacked" aria-label="Staff navigation">
            {primaryLinks.map((item) => (
              <NavLink
                currentPath={pathname}
                href={item.href}
                icon={item.icon}
                key={item.href}
                label={item.label}
              />
            ))}
          </nav>

          <div className="sidebar-block">
            <div className="sidebar-block__header">
              <p className="eyebrow">Outlets</p>
            </div>
            <div className="pill-list">
              {session.user.outlets.map((outlet) => (
                <Link
                  className={
                    currentOutlet?.id === outlet.id
                      ? 'context-pill context-pill--active context-pill--dark'
                      : 'context-pill context-pill--dark'
                  }
                  href={`/outlets/${outlet.id}/orders`}
                  key={outlet.id}
                >
                  <span>{outlet.name}</span>
                  <small>
                    {outlet.slug} | {outlet.role}
                  </small>
                </Link>
              ))}
            </div>
          </div>

          {currentOutlet ? (
            <div className="sidebar-block">
              <div className="sidebar-block__header">
                <p className="eyebrow">Current station</p>
                <h3 className="sidebar-subtitle">{currentOutlet.name}</h3>
              </div>
              <nav
                className="workspace-nav workspace-nav--dark"
                aria-label={`Workspace navigation for ${currentOutlet.name}`}
              >
                {outletLinks.map((item) => (
                  <NavLink
                    currentPath={pathname}
                    href={`/outlets/${currentOutlet.id}/${item.slug}`}
                    icon={item.icon}
                    key={item.slug}
                    label={item.label}
                  />
                ))}
              </nav>
            </div>
          ) : null}

          <button className="ghost-button ghost-button--full ghost-button--dark" onClick={signOut} type="button">
            <LogOut aria-hidden="true" size={16} />
            Sign out
          </button>
        </aside>

        <section className="staff-content">
          <header className="page-header page-header--staff">
            <div>
              <p className="eyebrow">Service operations</p>
              <h1 className="page-title serif">{title}</h1>
              <p className="page-subtitle">{subtitle}</p>
            </div>
          </header>
          {children}
        </section>
      </div>
    </main>
  );
}

function NavLink({
  currentPath,
  href,
  label,
  icon: Icon,
}: {
  currentPath: string;
  href: string;
  label: string;
  icon: LucideIcon;
}) {
  const current = currentPath === href || currentPath.startsWith(`${href}/`);
  return (
    <Link
      className={current ? 'nav-link-current nav-link-rich' : 'nav-link nav-link-rich'}
      href={href}
    >
      <span className="nav-link-rich__icon">
        <Icon aria-hidden="true" size={18} />
      </span>
      <span className="nav-link-rich__copy">
        <strong>{label}</strong>
      </span>
    </Link>
  );
}
