'use client';

import Link from 'next/link';
import { LayoutList, ScanLine, SquareTerminal } from 'lucide-react';
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
            <p className="eyebrow">Staff Operations</p>
            <h1 className="display-title serif">
              Keep the floor, pass, and pickup flow moving.
            </h1>
            <p className="supporting-copy">
              This first staff console is built for service hours: live outlet
              access, active order visibility, table state awareness, and clean
              handoffs from paid QR orders into kitchen execution.
            </p>
          </div>

          <div className="feature-grid">
            <article className="feature-card">
              <LayoutList size={18} />
              <h3>Service queue</h3>
              <p>
                Track every outlet order from kitchen release to completion.
              </p>
            </article>
            <article className="feature-card">
              <ScanLine size={18} />
              <h3>Table awareness</h3>
              <p>See zone and table states with QR coverage in one place.</p>
            </article>
            <article className="feature-card">
              <SquareTerminal size={18} />
              <h3>POS next</h3>
              <p>
                The walk-in order entry surface now has a real landing zone.
              </p>
            </article>
          </div>
        </section>

        <section className="panel compact-card">
          <p className="eyebrow">Start service</p>
          <h2 className="section-title serif">Open staff sign in</h2>
          <p className="supporting-copy">
            Use the same company slug, staff email, and password model as the
            backend JWT auth flow. Outlet access stays tenant-isolated.
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
