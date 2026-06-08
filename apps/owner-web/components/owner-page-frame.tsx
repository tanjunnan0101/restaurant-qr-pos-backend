'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useOwnerSession } from './owner-session-guard';

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

  return (
    <main className="owner-shell">
      <div className="owner-page-layout">
        <aside className="sidebar-panel">
          <div>
            <p className="eyebrow">Signed in</p>
            <h2 className="sidebar-title serif">{session.user.fullName}</h2>
            <p>{session.user.email}</p>
          </div>

          <nav className="sidebar-nav" aria-label="Owner navigation">
            <NavLink
              currentPath={pathname}
              href="/dashboard"
              label="Dashboard"
            />
          </nav>

          <div className="list-block">
            <div className="info-card">
              <span className="metric-label">Company</span>
              <span className="metric-value">
                {session.user.outlets.length}
              </span>
              <p className="metric-note">
                Accessible outlets in this owner session.
              </p>
            </div>
          </div>

          <button className="ghost-button" type="button" onClick={signOut}>
            Sign out
          </button>
        </aside>

        <section className="owner-grid">
          <header className="page-header">
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
