import { Download, RotateCw } from 'lucide-react';
import { OwnerShell } from '@/components/owner-shell';
import { PageSection } from '@/components/page-section';
import { StatusPill } from '@/components/status-pill';
import { tableZones } from '@/lib/owner-demo';

export const metadata = {
  title: 'Tables And QR',
};

export default async function TablesPage({
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
            <RotateCw aria-hidden="true" size={18} />
            Rotate QR
          </button>
          <button className="button" type="button">
            <Download aria-hidden="true" size={18} />
            Export QR cards
          </button>
        </>
      }
      aside={
        <div className="insight-card">
          <p className="eyebrow">API target</p>
          <h2>Dining table routes</h2>
          <p>
            Wire to `GET /admin/outlets/{outletId}/tables`, setup, and per-table
            QR token rotation once owner auth is connected.
          </p>
        </div>
      }
      description={`Configure zones, tables, and QR assets for outlet ${outletId}.`}
      eyebrow="QR setup"
      title="Tables and QR codes"
    >
      <PageSection
        description="The first live owner version should make table-card exports simple for every new restaurant."
        title="Dining zones"
      >
        <div className="card-grid">
          {tableZones.map((zone) => (
            <article className="setup-card" key={zone.zone}>
              <div className="setup-card__top">
                <h3>{zone.zone}</h3>
                <StatusPill
                  tone={zone.qrState === 'Draft' ? 'attention' : 'success'}
                >
                  {zone.qrState}
                </StatusPill>
              </div>
              <strong>{zone.tables}</strong>
              <p>{zone.note}</p>
            </article>
          ))}
        </div>
      </PageSection>
    </OwnerShell>
  );
}
