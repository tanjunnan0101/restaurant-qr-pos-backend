'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  LayoutDashboard,
  ShieldCheck,
} from 'lucide-react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { loadSession } from '@/lib/session';

export function OwnerLandingPage() {
  const router = useRouter();

  useEffect(() => {
    if (loadSession()) {
      router.replace('/dashboard');
    }
  }, [router]);

  return (
    <main className="owner-shell">
      <div className="owner-auth-layout">
        <section className="brand-panel">
          <div className="owner-grid">
            <p className="eyebrow">Owner Console</p>
            <h1 className="display-title serif">
              One place to run your menu, tables, payments, and outlet setup.
            </h1>
            <p className="lede">
              This console uses the existing restaurant backend, owner
              activation flow, and outlet administration APIs. Start with
              activation if this is a new client account, or sign in to continue
              where the onboarding left off.
            </p>
          </div>
          <div className="kpi-grid">
            <article className="dashboard-card">
              <span className="metric-label">Accounts</span>
              <span className="metric-value">Owner-first</span>
              <p className="metric-note">
                Activation and login are wired to the live backend auth APIs.
              </p>
            </article>
            <article className="dashboard-card">
              <span className="metric-label">Dashboards</span>
              <span className="metric-value">Hydrated</span>
              <p className="metric-note">
                Company, outlet, menu, table, payment, and printing data come
                from current APIs.
              </p>
            </article>
            <article className="dashboard-card">
              <span className="metric-label">Scope</span>
              <span className="metric-value">Multi-tenant</span>
              <p className="metric-note">
                Each restaurant uses the same owner app with tenant-isolated
                backend data.
              </p>
            </article>
          </div>
        </section>

        <section className="content-panel">
          <p className="eyebrow">Choose your path</p>
          <h2 className="serif">Get into the live owner flow</h2>
          <p>
            Use the activation link sent during onboarding, or sign in with your
            company slug, email address, and password.
          </p>

          <div className="list-block">
            <article className="list-item">
              <div className="badge-row">
                <span className="badge">
                  <ShieldCheck size={14} />
                  Secure activation
                </span>
              </div>
              <h3>Activate owner account</h3>
              <p>
                Sets the owner password through the backend activation token
                flow and returns you to login with the company slug already
                known.
              </p>
              <div className="action-row">
                <Link className="primary-button" href="/activate">
                  Open activation
                </Link>
              </div>
            </article>

            <article className="list-item">
              <div className="badge-row">
                <span className="badge">
                  <Building2 size={14} />
                  Tenant login
                </span>
              </div>
              <h3>Sign in to owner dashboard</h3>
              <p>
                Uses the live JWT login endpoint and stores a local browser
                session for the owner console.
              </p>
              <div className="action-row">
                <Link className="primary-button" href="/login">
                  Sign in
                </Link>
              </div>
            </article>

            <article className="list-item">
              <div className="badge-row">
                <span className="badge">
                  <LayoutDashboard size={14} />
                  Read-only operations view
                </span>
              </div>
              <h3>Dashboard first cut</h3>
              <p>
                The initial dashboard focuses on surfacing backend data clearly
                before building write-heavy setup forms.
              </p>
              <div className="action-row">
                <Link className="secondary-button" href="/dashboard">
                  Continue to dashboard
                  <ArrowRight size={16} />
                </Link>
              </div>
            </article>
          </div>
        </section>
      </div>
    </main>
  );
}
