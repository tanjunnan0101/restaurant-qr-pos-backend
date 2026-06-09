'use client';

import Link from 'next/link';
import { CreditCard, LayoutList, ScanLine, SquareTerminal } from 'lucide-react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { loadSession } from '@/lib/session';

export function StaffLandingPage() {
  const router = useRouter();

  useEffect(() => {
    if (loadSession()) {
      router.replace('/dashboard');
    }
  }, [router]);

  return (
    <main className="staff-shell">
      <div className="auth-layout">
        <section className="hero-card">
          <div className="hero-copy">
            <p className="eyebrow">Staff terminal</p>
            <h1 className="display-title serif">Run service from one board.</h1>
            <p className="supporting-copy">
              Open the outlet floor, live queue, cashier POS, and kitchen flow
              from one touch-first staff surface.
            </p>
          </div>

          <div className="feature-grid">
            <article className="feature-card">
              <LayoutList size={18} />
              <h3>Service board</h3>
              <p>See live queue, help requests, and outlet pressure instantly.</p>
            </article>
            <article className="feature-card">
              <ScanLine size={18} />
              <h3>Tables and QR</h3>
              <p>Open a table, resolve help, and keep QR coverage visible.</p>
            </article>
            <article className="feature-card">
              <SquareTerminal size={18} />
              <h3>POS terminal</h3>
              <p>Run counter, waiter, and QR-linked tickets in one workflow.</p>
            </article>
            <article className="feature-card">
              <CreditCard size={18} />
              <h3>Payment recovery</h3>
              <p>Handle unpaid, manual, and blocked checkout cases quickly.</p>
            </article>
          </div>
        </section>

        <section className="panel compact-card">
          <p className="eyebrow">Start service</p>
          <h2 className="section-title">Open staff sign in</h2>
          <p className="supporting-copy">
            Use the same company slug, staff email, and password model as the
            backend JWT auth flow.
          </p>
          <div className="stack-actions">
            <Link className="primary-button" href="/login">
              Go to login
            </Link>
            <Link className="secondary-button" href="/dashboard">
              Try dashboard
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
