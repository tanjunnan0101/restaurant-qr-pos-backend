import { LogIn } from 'lucide-react';
import Link from 'next/link';

export const metadata = {
  title: 'Owner Login',
};

export default function LoginPage() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-card__icon">
          <LogIn aria-hidden="true" size={30} />
        </div>
        <p className="eyebrow">Owner login</p>
        <h1>Sign in to a client account</h1>
        <p>
          This supports the simple onboarding model: one owner-web app, multiple
          restaurant clients, and a unique company slug per client.
        </p>

        <form className="form-grid" aria-label="Owner login form">
          <label>
            Company slug
            <input
              autoComplete="organization"
              name="companySlug"
              placeholder="demo-restaurant"
              type="text"
            />
          </label>
          <label>
            Owner email
            <input
              autoComplete="email"
              name="email"
              placeholder="owner@example.com"
              type="email"
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              name="password"
              placeholder="Enter password"
              type="password"
            />
          </label>
          <button className="button" type="button">
            <LogIn aria-hidden="true" size={18} />
            Continue
          </button>
        </form>

        <p className="auth-card__footer">
          Need to activate first?{' '}
          <Link href="/activate">Use activation token</Link>
        </p>
      </section>
    </main>
  );
}
