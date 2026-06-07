import { Clock, Power } from 'lucide-react';
import { OwnerShell } from '@/components/owner-shell';
import { PageSection } from '@/components/page-section';
import { StatusPill } from '@/components/status-pill';
import { paymentControls } from '@/lib/owner-demo';

export const metadata = {
  title: 'Payment Settings',
};

export default async function PaymentSettingsPage({
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
            <Clock aria-hidden="true" size={18} />
            Schedule disable
          </button>
          <button className="button" type="button">
            <Power aria-hidden="true" size={18} />
            Apply now
          </button>
        </>
      }
      aside={
        <div className="insight-card">
          <p className="eyebrow">Payment note</p>
          <h2>HitPay is the live hosted provider</h2>
          <p>
            The customer QR checkout currently exposes online card through
            HitPay. PayNow disable controls are scaffolded because the backend
            has PayNow scopes and the staff POS path may need them later.
          </p>
        </div>
      }
      description={`Control payment availability for outlet ${outletId}, including manual shutdowns during provider or bank downtime.`}
      eyebrow="Payment controls"
      title="Payment settings"
    >
      <PageSection
        description="These controls line up with the backend payment scopes: ONLINE, ONLINE_CARD, MANUAL_PAYNOW, and compatibility scopes."
        title="Manual payment switches"
      >
        <div className="card-grid">
          {paymentControls.map((control) => (
            <article className="setup-card" key={control.scope}>
              <div className="setup-card__top">
                <span className="mono-label">{control.scope}</span>
                <StatusPill tone={control.tone}>{control.state}</StatusPill>
              </div>
              <h3>{control.label}</h3>
              <p className="muted">{control.provider}</p>
              <p>{control.detail}</p>
            </article>
          ))}
        </div>
      </PageSection>
    </OwnerShell>
  );
}
