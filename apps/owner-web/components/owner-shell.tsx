import { ChevronRight, Store } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ownerNavItems } from '@/lib/owner-demo';

interface OwnerShellProps {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
}

export function OwnerShell({
  eyebrow,
  title,
  description,
  children,
  actions,
  aside,
}: OwnerShellProps) {
  return (
    <div className="owner-app">
      <aside className="owner-sidebar" aria-label="Owner navigation">
        <Link className="owner-brand" href="/dashboard">
          <span className="owner-brand__mark">
            <Store aria-hidden="true" size={22} />
          </span>
          <span>
            <strong>Owner Web</strong>
            <small>Restaurant QR POS</small>
          </span>
        </Link>

        <nav className="owner-nav">
          {ownerNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                className="owner-nav__link"
                href={item.href}
                key={item.href}
              >
                <span className="owner-nav__icon">
                  <Icon aria-hidden="true" size={20} />
                </span>
                <span className="owner-nav__copy">
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
                <ChevronRight aria-hidden="true" size={16} />
              </Link>
            );
          })}
        </nav>

        <div className="owner-sidebar__note">
          <span className="eyebrow">Client model</span>
          <p>
            One owner-web app can serve all restaurants. Each client signs in
            with their company slug, owner email, and password.
          </p>
        </div>
      </aside>

      <main className="owner-main">
        <header className="owner-header">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          {actions ? (
            <div className="owner-header__actions">{actions}</div>
          ) : null}
        </header>

        <div
          className={
            aside ? 'owner-content owner-content--with-aside' : 'owner-content'
          }
        >
          <section>{children}</section>
          {aside ? <aside className="owner-aside">{aside}</aside> : null}
        </div>
      </main>
    </div>
  );
}
