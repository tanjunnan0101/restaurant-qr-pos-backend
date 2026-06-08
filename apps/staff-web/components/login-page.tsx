'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/lib/api';
import { loadSession, saveSession, toSession } from '@/lib/session';

export function LoginPage() {
  const router = useRouter();
  const [companySlug, setCompanySlug] = useState('');
  const [email, setEmail] = useState('');
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
    <main className="staff-shell">
      <div className="auth-layout">
        <section className="hero-card">
          <div className="hero-copy">
            <p className="eyebrow">Shift Sign In</p>
            <h1 className="display-title serif">
              Step into the outlet operations board.
            </h1>
            <p className="supporting-copy">
              Use a staff account that already has outlet permissions such as
              order read or order manage. This login calls the live
              <code> /auth/login </code>
              endpoint.
            </p>
          </div>
        </section>

        <section className="panel compact-card">
          <p className="eyebrow">Authentication</p>
          <h2 className="section-title serif">Staff login</h2>

          <form className="form-grid" onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="companySlug">Company slug</label>
              <input
                id="companySlug"
                onChange={(event) => setCompanySlug(event.target.value)}
                placeholder="demo-restaurant"
                required
                value={companySlug}
              />
            </div>

            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="staff@example.com"
                required
                type="email"
                value={email}
              />
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Your password"
                required
                type="password"
                value={password}
              />
            </div>

            {error ? <div className="alert error">{error}</div> : null}

            <button className="primary-button" disabled={busy} type="submit">
              {busy ? 'Signing in...' : 'Open service board'}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
