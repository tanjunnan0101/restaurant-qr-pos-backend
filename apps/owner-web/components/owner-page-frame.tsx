'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import {
  Building2,
  CreditCard,
  LayoutDashboard,
  LogOut,
  MenuSquare,
  Printer,
  ReceiptText,
  Settings2,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useOwnerSession } from './owner-session-guard';

const ownerPrimaryLinks = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    helper: 'Portfolio and rollout health',
    icon: LayoutDashboard,
  },
];

const ownerOutletLinks = [
  {
    slug: 'reports',
    label: 'Reports',
    helper: 'Sales and order pulse',
    icon: ReceiptText,
  },
  {
    slug: 'menu',
    label: 'Menu',
    helper: 'Catalogue and publish flow',
    icon: MenuSquare,
  },
  {
    slug: 'payment-settings',
    label: 'Payments',
    helper: 'Checkout and payment toggles',
    icon: CreditCard,
  },
  {
    slug: 'staff',
    label: 'Staff',
    helper: 'Roles and activation links',
    icon: Users,
  },
  {
    slug: 'printing',
    label: 'Printing',
    helper: 'Receipts and station routing',
    icon: Printer,
  },
  {
    slug: 'settings',
    label: 'Settings',
    helper: 'Outlet profile and defaults',
    icon: Settings2,
  },
];

export function OwnerPageFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { session, loading, signOut } = useOwnerSession();

  if (loading || !session) {
    return (
      <main className="owner-shell loading-panel">
        <section className="content-panel loading-card">
          <p className="eyebrow">Owner Console</p>
          <h1 className="serif">Checking your session...</h1>
          <p>We are opening the owner workspace with your saved login.</p>
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
    <main className="owner-shell">
      <div className="owner-page-layout">
        <aside className="sidebar-panel sidebar-panel--rich">
          <Link className="sidebar-brand" href="/dashboard">
            <span className="sidebar-brand__mark">
              <Building2 aria-hidden="true" size={20} />
            </span>
            <span className="sidebar-brand__copy">
              <strong>Sakorio Owner</strong>
              <small>Rollout, revenue, and outlet control</small>
            </span>
          </Link>

          <div className="session-card">
            <div>
              <p className="eyebrow">Signed in</p>
              <h2 className="sidebar-title serif">{session.user.fullName}</h2>
              <p>{session.user.email}</p>
            </div>
            <div className="detail-grid">
              <article className="info-card info-card--compact">
                <span className="metric-label">Outlets</span>
                <span className="metric-value">
                  {session.user.outlets.length}
                </span>
                <p className="metric-note">Accessible in this owner session.</p>
              </article>
              <article className="info-card info-card--compact">
                <span className="metric-label">Permissions</span>
                <span className="metric-value">Owner</span>
                <p className="metric-note">
                  Company-wide access is active for the current tenant.
                </p>
              </article>
            </div>
          </div>

          <nav className="sidebar-nav sidebar-nav--stacked" aria-label="Owner navigation">
            {ownerPrimaryLinks.map((item) => (
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
              <p className="eyebrow">Tenant scope</p>
              <p className="sidebar-helper">
                One owner web app can serve multiple restaurant groups. The
                company slug keeps every dataset isolated.
              </p>
            </div>

            <div className="context-list">
              {session.user.outlets.map((outlet) => (
                <Link
                  className={
                    currentOutlet?.id === outlet.id
                      ? 'context-pill context-pill--active'
                      : 'context-pill'
                  }
                  href={`/outlets/${outlet.id}/reports`}
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
                <p className="sidebar-helper">
                  Move between setup, payments, staff, and printing without
                  losing the outlet context.
                </p>
              </div>

              <nav
                className="workspace-nav"
                aria-label={`Workspace navigation for ${currentOutlet.name}`}
              >
                {ownerOutletLinks.map((item) => (
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

          <div className="sidebar-callout">
            <ShieldCheck aria-hidden="true" size={18} />
            <div>
              <strong>Shared hosting, isolated tenants</strong>
              <p>
                The same deployment can power many restaurants while keeping
                data, outlets, and sessions separated.
              </p>
            </div>
          </div>

          <button className="ghost-button ghost-button--full" type="button" onClick={signOut}>
            <LogOut aria-hidden="true" size={16} />
            Sign out
          </button>
        </aside>

        <section className="owner-grid">
          <header className="page-header page-header--framed">
            <div>
              <p className="eyebrow">Owner Workspace</p>
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
