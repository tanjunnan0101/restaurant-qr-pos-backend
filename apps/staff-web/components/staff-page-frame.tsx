'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useStaffSession } from './staff-session-guard';

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

  return (
    <main className="staff-shell">
      <div className="staff-page-layout">
        <aside className="staff-sidebar">
          <div className="sidebar-block">
            <p className="eyebrow">Signed in</p>
            <h2 className="sidebar-title serif">{session.user.fullName}</h2>
            <p className="supporting-copy">{session.user.email}</p>
          </div>

          <nav className="sidebar-nav" aria-label="Staff navigation">
            <NavLink
              currentPath={pathname}
              href="/dashboard"
              label="Dashboard"
            />
          </nav>

          <div className="sidebar-block">
            <p className="eyebrow">Accessible outlets</p>
            <div className="pill-list">
              {session.user.outlets.map((outlet) => (
                <Link
                  className="context-pill"
                  href={`/outlets/${outlet.id}/orders`}
                  key={outlet.id}
                >
                  <span>{outlet.name}</span>
                  <small>{outlet.role}</small>
                </Link>
              ))}
            </div>
          </div>

          <button className="ghost-button" onClick={signOut} type="button">
            Sign out
          </button>
        </aside>

        <section className="staff-content">
          <header className="page-header">
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
}: {
  currentPath: string;
  href: string;
  label: string;
}) {
  const current = currentPath === href || currentPath.startsWith(`${href}/`);
  return (
    <Link className={current ? 'nav-link-current' : 'nav-link'} href={href}>
      {label}
    </Link>
  );
}
