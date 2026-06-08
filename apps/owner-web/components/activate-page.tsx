'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';
import { activateAccount } from '@/lib/api';

export function ActivatePage() {
  const router = useRouter();
  const search = useSearchParams();
  const presetToken = search.get('token') ?? '';
  const companySlug = search.get('company') ?? '';
  const [token, setToken] = useState(presetToken);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const passwordHint = useMemo(
    () => 'Use at least 12 characters with upper, lower, and number.',
    [],
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const response = await activateAccount(token, password);
      setSuccess('Account activated. Redirecting you to login...');
      window.setTimeout(() => {
        const query = new URLSearchParams({
          company: response.companySlug,
          email: response.email,
        });
        router.replace(`/login?${query.toString()}`);
      }, 900);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Activation failed.',
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
            <p className="eyebrow">Owner Activation</p>
            <h1 className="display-title serif">
              Activate the owner account and finish the handoff.
            </h1>
            <p className="lede">
              This page accepts the one-time onboarding token from the backend.
              Once activated, the account can sign in normally with company
              slug, email, and password.
            </p>
          </div>
          <article className="info-card">
            <span className="metric-label">Current company</span>
            <span className="metric-value">
              {companySlug || 'From activation link'}
            </span>
            <p className="metric-note">
              If you opened the generated onboarding URL, the token and company
              slug should already be filled in.
            </p>
          </article>
        </section>

        <section className="form-panel">
          <p className="eyebrow">One-time setup</p>
          <h2 className="serif">Set your password</h2>
          <p>
            Uses the live `POST /auth/activate` endpoint and marks the owner
            account active.
          </p>

          <form className="form-grid" onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="token">Activation token</label>
              <input
                id="token"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Paste the token from the activation link"
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
                placeholder="Create a strong password"
                required
              />
              <span className="helper-text">{passwordHint}</span>
            </div>

            <div className="field">
              <label htmlFor="confirmPassword">Confirm password</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Re-enter your password"
                required
              />
            </div>

            {error && <div className="alert error">{error}</div>}
            {success && <div className="alert success">{success}</div>}

            <div className="action-row">
              <button className="primary-button" disabled={busy} type="submit">
                {busy ? 'Activating...' : 'Activate account'}
              </button>
              <Link className="secondary-button" href="/login">
                Back to login
              </Link>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
