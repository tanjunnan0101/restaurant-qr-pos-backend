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
    helper: 'Live outlet overview',
    icon: LayoutDashboard,
  },
];

const outletLinks = [
  {
    slug: 'orders',
    label: 'Orders',
    helper: 'Queue and service tracking',
    icon: ClipboardList,
  },
  {
    slug: 'kds',
    label: 'Kitchen',
    helper: 'Preparation and pass board',
    icon: ScanLine,
  },
  {
    slug: 'tables',
    label: 'Tables',
    helper: 'Floor state and QR coverage',
    icon: Store,
  },
  {
    slug: 'pos',
    label: 'POS',
    helper: 'Walk-in and cashier flow',
    icon: SquareTerminal,
  },
  {
    slug: 'inventory',
    label: 'Inventory',
    helper: 'Stock, recipes, movement log',
    icon: Package,
  },
  {
    slug: 'printing',
    label: 'Printing',
    helper: 'Receipts, jobs, and routes',
    icon: Printer,
  },
  {
    slug: 'staff',
    label: 'Team',
    helper: 'Attendance and role operations',
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
              <p className="eyebrow">Signed in</p>
              <h2 className="sidebar-title serif">{session.user.fullName}</h2>
              <p className="supporting-copy">{session.user.email}</p>
            </div>
            <div className="profile-metrics">
              <article className="sub-panel">
                <span className="metric-label">Outlets</span>
                <strong className="metric-value">
                  {session.user.outlets.length}
                </strong>
                <p className="supporting-copy">Live in this shift scope.</p>
              </article>
            </div>
          </div>

          <nav className="sidebar-nav sidebar-nav--stacked" aria-label="Staff navigation">
            {primaryLinks.map((item) => (
              <NavLink
                currentPath={pathname}
                helper={item.helper}
                href={item.href}
                icon={item.icon}
                key={item.href}
                label={item.label}
              />
            ))}
          </nav>

          <div className="sidebar-block">
            <div className="sidebar-block__header">
              <p className="eyebrow">Accessible outlets</p>
              <p className="sidebar-helper sidebar-helper--light">
                Jump straight into the station board that matches the current
                shift.
              </p>
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
                <p className="eyebrow">Current outlet</p>
                <h3 className="sidebar-subtitle">{currentOutlet.name}</h3>
                <p className="sidebar-helper sidebar-helper--light">
                  Keep queue, POS, tables, and printing within one compact
                  workspace.
                </p>
              </div>
              <nav
                className="workspace-nav workspace-nav--dark"
                aria-label={`Workspace navigation for ${currentOutlet.name}`}
              >
                {outletLinks.map((item) => (
                  <NavLink
                    currentPath={pathname}
                    helper={item.helper}
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
  helper,
  icon: Icon,
}: {
  currentPath: string;
  href: string;
  label: string;
  helper: string;
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
        <small>{helper}</small>
      </span>
    </Link>
  );
}
