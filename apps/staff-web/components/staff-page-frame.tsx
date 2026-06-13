'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import {
  BellRing,
  ClipboardList,
  Clock3,
  LayoutDashboard,
  LogOut,
  MenuSquare,
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
    label: 'Service',
    icon: LayoutDashboard,
  },
];

const outletPrimaryLinks = [
  {
    slug: 'pos',
    label: 'POS',
    icon: SquareTerminal,
  },
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
];

const outletSupportLinks = [
  {
    slug: 'menus',
    label: 'Menus',
    icon: MenuSquare,
  },
  {
    slug: 'inventory',
    label: 'Inventory',
    icon: Package,
  },
  {
    slug: 'attendance',
    label: 'Attendance',
    icon: Clock3,
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
        <section className="panel section-panel terminal-loading-card">
          <p className="eyebrow">Staff terminal</p>
          <h1 className="page-title page-title--terminal">
            Opening the service board...
          </h1>
          <p className="supporting-copy">
            Loading your outlet permissions, live queue state, and terminal
            shortcuts.
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
  const currentMode = resolveCurrentMode(pathname);
  const isOutletPage = pathname.startsWith('/outlets/');

  return (
    <main className="staff-shell">
      <div className="staff-page-layout">
        <aside className="staff-sidebar staff-sidebar--terminal">
          <Link
            className="sidebar-brand sidebar-brand--terminal"
            href="/dashboard"
          >
            <span className="sidebar-brand__mark sidebar-brand__mark--terminal">
              <SquareTerminal aria-hidden="true" size={18} />
            </span>
            <span className="sidebar-brand__copy">
              <strong>Sakorio</strong>
              <small>Staff terminal</small>
            </span>
          </Link>

          <section className="staff-operator-card">
            <div className="staff-operator-card__copy">
              <p className="eyebrow">Signed in</p>
              <h2 className="staff-operator-card__title">
                {session.user.fullName}
              </h2>
              <p className="supporting-copy">{session.user.email}</p>
            </div>
            <div className="staff-operator-card__meta">
              <span className="terminal-stat">
                <strong>{session.user.outlets.length}</strong>
                <small>outlets</small>
              </span>
              <span className="terminal-stat">
                <strong>{currentMode}</strong>
                <small>mode</small>
              </span>
            </div>
            {currentOutlet ? (
              <div className="terminal-inline-note">
                <span>Current outlet</span>
                <strong>
                  {currentOutlet.name} | {currentOutlet.role}
                </strong>
              </div>
            ) : null}
          </section>

          <div className="sidebar-section">
            <div className="sidebar-section__header">
              <p className="eyebrow">Core</p>
            </div>
            <nav
              className="sidebar-nav sidebar-nav--terminal"
              aria-label="Staff navigation"
            >
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
          </div>

          <div className="sidebar-section">
            <div className="sidebar-section__header">
              <p className="eyebrow">Stations</p>
              <span className="terminal-mini-label">
                {currentOutlet ? currentOutlet.name : 'No outlet'}
              </span>
            </div>
            <div className="pill-list pill-list--terminal">
              {session.user.outlets.map((outlet) => (
                <Link
                  className={
                    currentOutlet?.id === outlet.id
                      ? 'context-pill context-pill--terminal current'
                      : 'context-pill context-pill--terminal'
                  }
                  href={`/outlets/${outlet.id}/pos`}
                  key={outlet.id}
                >
                  <span>{outlet.name}</span>
                  <small>{outlet.role}</small>
                </Link>
              ))}
            </div>
          </div>

          {currentOutlet ? (
            <>
              <div className="sidebar-section">
                <div className="sidebar-section__header">
                  <p className="eyebrow">Service flow</p>
                </div>
                <nav
                  className="workspace-nav workspace-nav--terminal"
                  aria-label={`Primary workspace navigation for ${currentOutlet.name}`}
                >
                  {outletPrimaryLinks.map((item) => (
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

              <div className="sidebar-section">
                <div className="sidebar-section__header">
                  <p className="eyebrow">Support</p>
                </div>
                <nav
                  className="workspace-nav workspace-nav--terminal workspace-nav--support"
                  aria-label={`Support navigation for ${currentOutlet.name}`}
                >
                  {outletSupportLinks.map((item) => (
                    <NavLink
                      compact
                      currentPath={pathname}
                      href={`/outlets/${currentOutlet.id}/${item.slug}`}
                      icon={item.icon}
                      key={item.slug}
                      label={item.label}
                    />
                  ))}
                </nav>
              </div>
            </>
          ) : null}

          <div className="staff-sidebar-footer">
            <div className="terminal-alert-card">
              <BellRing aria-hidden="true" size={16} />
              <div>
                <strong>Rush rule</strong>
                <small>Keep queue, payment, and table state visible.</small>
              </div>
            </div>
          </div>

          <button
            className="ghost-button ghost-button--full ghost-button--terminal"
            onClick={signOut}
            type="button"
          >
            <LogOut aria-hidden="true" size={16} />
            Sign out
          </button>
        </aside>

        <section className="staff-content">
          <header
            className={
              isOutletPage
                ? 'staff-command-header staff-command-header--compact'
                : 'staff-command-header'
            }
          >
            <div className="staff-command-header__title">
              <p className="eyebrow">Staff terminal</p>
              <h1
                className={
                  isOutletPage
                    ? 'page-title page-title--terminal page-title--terminal-compact'
                    : 'page-title page-title--terminal'
                }
              >
                {title}
              </h1>
            </div>
            <div className="staff-command-header__meta">
              <div className="command-pill command-pill--strong">
                <span>Mode</span>
                <strong>{currentMode}</strong>
              </div>
              {currentOutlet ? (
                <div className="command-pill">
                  <span>Station</span>
                  <strong>{currentOutlet.name}</strong>
                </div>
              ) : null}
              {currentOutlet ? (
                <div className="command-pill">
                  <span>Role</span>
                  <strong>{currentOutlet.role}</strong>
                </div>
              ) : null}
            </div>
          </header>

          {!isOutletPage ? (
            <section className="staff-page-intro">
              <p>{subtitle}</p>
            </section>
          ) : null}
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
  compact = false,
}: {
  currentPath: string;
  href: string;
  label: string;
  icon: LucideIcon;
  compact?: boolean;
}) {
  const current = currentPath === href || currentPath.startsWith(`${href}/`);
  return (
    <Link
      className={
        current
          ? compact
            ? 'nav-link-current nav-link-terminal nav-link-terminal--compact'
            : 'nav-link-current nav-link-terminal'
          : compact
            ? 'nav-link nav-link-terminal nav-link-terminal--compact'
            : 'nav-link nav-link-terminal'
      }
      href={href}
    >
      <span className="nav-link-terminal__icon">
        <Icon aria-hidden="true" size={18} />
      </span>
      <span className="nav-link-terminal__copy">
        <strong>{label}</strong>
      </span>
    </Link>
  );
}

function resolveCurrentMode(pathname: string): string {
  if (pathname.startsWith('/dashboard')) {
    return 'Service';
  }
  if (pathname.includes('/pos')) {
    return 'POS';
  }
  if (pathname.includes('/tables')) {
    return 'Tables';
  }
  if (pathname.includes('/kds')) {
    return 'Kitchen';
  }
  if (pathname.includes('/orders')) {
    return 'Orders';
  }
  if (pathname.includes('/inventory')) {
    return 'Inventory';
  }
  if (pathname.includes('/printing')) {
    return 'Printing';
  }
  if (pathname.includes('/attendance')) {
    return 'Attendance';
  }
  if (pathname.includes('/staff')) {
    return 'Team';
  }
  if (pathname.includes('/menus')) {
    return 'Menus';
  }
  return 'Terminal';
}
