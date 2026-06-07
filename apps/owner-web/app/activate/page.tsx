import { KeyRound, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

export const metadata = {
  title: 'Activate Owner Account',
};

export default function ActivatePage() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-card__icon">
          <ShieldCheck aria-hidden="true" size={30} />
        </div>
        <p className="eyebrow">Owner activation</p>
        <h1>Set the owner password</h1>
        <p>
          Owners receive an activation token during onboarding. The backend
          expects a token plus a password with uppercase, lowercase, and numeric
          characters.
        </p>

        <form className="form-grid" aria-label="Owner activation form">
          <label>
            Activation token
            <input
              name="token"
              placeholder="Paste activation token"
              type="text"
            />
          </label>
          <label>
            New password
            <input
              autoComplete="new-password"
              name="password"
              placeholder="At least 12 characters"
              type="password"
            />
          </label>
          <button className="button" type="button">
            <KeyRound aria-hidden="true" size={18} />
            Activate account
          </button>
        </form>

        <p className="auth-card__footer">
          Already activated? <Link href="/login">Go to owner login</Link>
        </p>
      </section>
    </main>
  );
}
