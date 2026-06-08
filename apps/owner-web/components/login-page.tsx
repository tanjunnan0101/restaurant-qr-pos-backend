'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { login } from '@/lib/api';
import { loadSession, saveSession, toSession } from '@/lib/session';

export function LoginPage() {
  const router = useRouter();
  const search = useSearchParams();
  const [companySlug, setCompanySlug] = useState(search.get('company') ?? '');
  const [email, setEmail] = useState(search.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loadSession()) {
      router.replace('/dashboard');
    }
  }, [router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await login({ companySlug, email, password });
      saveSession(toSession(response));
      router.replace('/dashboard');
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Login failed.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="owner-shell">
      <div className="owner-auth-layout">
        <section className="brand-panel">
          <div className="owner-grid">
            <p className="eyebrow">Owner Sign In</p>
            <h1 className="display-title serif">
              Step into the control room for rollout, menus, and outlet health.
            </h1>
            <p className="lede">
              This login stays tenant-aware on purpose. Use the restaurant slug
              from onboarding with the owner email and password you activated,
              then continue into the live owner workspace.
            </p>
          </div>
          <div className="kpi-grid">
            <article className="dashboard-card">
              <span className="metric-label">Tenant-aware</span>
              <span className="metric-value">Slug + email</span>
              <p className="metric-note">
                Shared hosting stays safe because company selection is explicit.
              </p>
            </article>
            <article className="dashboard-card">
              <span className="metric-label">What opens next</span>
              <span className="metric-value">Owner board</span>
              <p className="metric-note">
                Sales, readiness, payments, tables, staff, and printing.
              </p>
            </article>
            <article className="dashboard-card">
              <span className="metric-label">Activation path</span>
              <span className="metric-value">Built in</span>
              <p className="metric-note">
                If this is a new client, activation is one click away from here.
              </p>
            </article>
          </div>
        </section>

        <section className="form-panel">
          <p className="eyebrow">Authentication</p>
          <h2 className="serif">Sign in</h2>
          <p>
            Use the live `POST /auth/login` API and continue into the owner
            dashboard.
          </p>

          <form className="form-grid" onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="companySlug">Company slug</label>
              <input
                id="companySlug"
                value={companySlug}
                onChange={(event) => setCompanySlug(event.target.value)}
                placeholder="demo-restaurant"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="owner@example.com"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 12 characters"
                required
              />
            </div>

            {error && <div className="alert error">{error}</div>}

            <div className="action-row">
              <button className="primary-button" disabled={busy} type="submit">
                {busy ? 'Signing in...' : 'Open dashboard'}
              </button>
              <Link className="secondary-button" href="/activate">
                Need activation?
              </Link>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
