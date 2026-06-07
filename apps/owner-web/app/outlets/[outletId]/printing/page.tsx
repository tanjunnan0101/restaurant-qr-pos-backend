import { Printer, RefreshCw } from 'lucide-react';
import { OwnerShell } from '@/components/owner-shell';
import { PageSection } from '@/components/page-section';
import { StatusPill } from '@/components/status-pill';
import { printerChecks } from '@/lib/owner-demo';

export const metadata = {
  title: 'Printing Setup',
};

export default async function PrintingPage({
  params,
}: {
  params: Promise<{ outletId: string }>;
}) {
  const { outletId } = await params;

  return (
    <OwnerShell
      actions={
        <>
          <button className="button button--secondary" type="button">
            <RefreshCw aria-hidden="true" size={18} />
            Refresh status
          </button>
          <button className="button" type="button">
            <Printer aria-hidden="true" size={18} />
            Test print
          </button>
        </>
      }
      aside={
        <div className="insight-card">
          <p className="eyebrow">Printer path</p>
          <h2>Wi-Fi compatible, agent backed</h2>
          <p>
            The backend supports printer setup, test jobs, retry, reprint, and a
            local printer-agent lease flow. Physical printer validation remains
            a later deployment/hardware task.
          </p>
        </div>
      }
      description={`Prepare Wi-Fi printer visibility and local-agent status for outlet ${outletId}.`}
      eyebrow="Printing"
      title="Printer setup visibility"
    >
      <PageSection
        description="Keep setup visible for owners without blocking the app scaffold on physical printer testing."
        title="Printer readiness"
      >
        <div className="card-grid">
          {printerChecks.map((check) => {
            const Icon = check.icon;
            return (
              <article className="setup-card" key={check.title}>
                <div className="setup-card__top">
                  <span className="setup-card__icon">
                    <Icon aria-hidden="true" size={20} />
                  </span>
                  <StatusPill
                    tone={
                      check.status === 'Needs physical test'
                        ? 'attention'
                        : 'neutral'
                    }
                  >
                    {check.status}
                  </StatusPill>
                </div>
                <h3>{check.title}</h3>
                <p>{check.description}</p>
              </article>
            );
          })}
        </div>
      </PageSection>
    </OwnerShell>
  );
}
