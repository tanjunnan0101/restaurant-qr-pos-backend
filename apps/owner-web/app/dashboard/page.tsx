import { ArrowRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { OwnerShell } from '@/components/owner-shell';
import { PageSection } from '@/components/page-section';
import { StatusPill } from '@/components/status-pill';
import { dashboardStats, onboardingSteps } from '@/lib/owner-demo';

export const metadata = {
  title: 'Dashboard',
};

export default function DashboardPage() {
  return (
    <OwnerShell
      actions={
        <Link className="button" href="/login">
          Switch client
          <ArrowRight aria-hidden="true" size={18} />
        </Link>
      }
      aside={
        <div className="insight-card">
          <p className="eyebrow">Next wiring pass</p>
          <h2>Auth first, then outlet state</h2>
          <p>
            The backend already has `/auth/login`, `/auth/activate`, and admin
            outlet routes. Once auth is wired, this dashboard can hydrate from
            the selected client and outlet instead of demo data.
          </p>
        </div>
      }
      description="Track owner onboarding, outlet setup, and pilot readiness before the first handover."
      eyebrow="Pilot setup"
      title="Owner setup dashboard"
    >
      <div className="metric-grid">
        {dashboardStats.map((stat) => (
          <article className="metric-card" key={stat.label}>
            <StatusPill tone={stat.tone}>{stat.label}</StatusPill>
            <strong>{stat.value}</strong>
            <p>{stat.detail}</p>
          </article>
        ))}
      </div>

      <PageSection
        description="These are the owner-facing steps that make onboarding repeatable across the first 10 restaurant clients."
        title="Client onboarding checklist"
      >
        <div className="checklist">
          {onboardingSteps.map((step) => (
            <Link className="checklist__item" href={step.href} key={step.title}>
              <span className="checklist__icon">
                <CheckCircle2 aria-hidden="true" size={20} />
              </span>
              <span>
                <strong>{step.title}</strong>
                <small>{step.description}</small>
              </span>
              <StatusPill tone={step.tone}>{step.status}</StatusPill>
            </Link>
          ))}
        </div>
      </PageSection>
    </OwnerShell>
  );
}
