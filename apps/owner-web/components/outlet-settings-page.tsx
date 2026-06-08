'use client';

import { useEffect, useState } from 'react';
import { updateOutlet } from '@/lib/api';
import type { OutletSummary } from '@/lib/types';
import { OutletHeader, OutletPageLayout, useOutletContext } from './outlet-page-base';

export function OutletSettingsPage() {
  const {
    outletId,
    session,
    loading,
    outlet,
    error: outletError,
    busy: outletBusy,
  } = useOutletContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [outletOverride, setOutletOverride] = useState<OutletSummary | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [timezone, setTimezone] = useState('Asia/Singapore');
  const [currency, setCurrency] = useState('SGD');
  const [gstEnabled, setGstEnabled] = useState(true);
  const [gstRateBps, setGstRateBps] = useState('900');
  const [serviceChargeEnabled, setServiceChargeEnabled] = useState(false);
  const [serviceChargeBps, setServiceChargeBps] = useState('1000');
  const [reason, setReason] = useState(
    'Updated outlet settings from the owner console.',
  );

  const effectiveOutlet = outletOverride ?? outlet;

  useEffect(() => {
    if (!outlet) {
      return;
    }
    setOutletOverride(null);
    setName(outlet.name);
    setSlug(outlet.slug);
    setTimezone(outlet.timezone);
    setCurrency(outlet.currency);
    setGstEnabled(outlet.gstEnabled);
    setGstRateBps(String(outlet.gstRateBps));
    setServiceChargeEnabled(outlet.serviceChargeEnabled);
    setServiceChargeBps(String(outlet.serviceChargeBps));
  }, [outlet]);

  async function handleSave() {
    if (!session?.accessToken) {
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const updatedOutlet = await updateOutlet(session.accessToken, outletId, {
        name: name.trim(),
        slug: slug.trim(),
        timezone: timezone.trim(),
        currency: currency.trim().toUpperCase(),
        gstEnabled,
        gstRateBps: Number.parseInt(gstRateBps, 10),
        serviceChargeEnabled,
        serviceChargeBps: Number.parseInt(serviceChargeBps, 10),
        reason: reason.trim(),
      });
      setOutletOverride(updatedOutlet);
      setSuccess('Outlet settings updated.');
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Failed to update outlet settings.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <OutletPageLayout
      title="Outlet settings"
      subtitle="Update the operating defaults for this outlet without leaving the owner console."
    >
      {effectiveOutlet ? <OutletHeader outlet={effectiveOutlet} /> : null}

      {loading || outletBusy ? (
        <section className="section-panel">
          <p>Loading outlet settings...</p>
        </section>
      ) : null}

      {outletError || error ? (
        <section className="section-panel">
          <div className="alert error">{outletError ?? error}</div>
        </section>
      ) : null}

      {!loading && !outletBusy && effectiveOutlet ? (
        <section className="section-panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">Outlet defaults</p>
              <h2 className="serif">Business settings</h2>
              <p>
                Manage the customer-facing and reporting defaults for this
                outlet, including tax and service charge behavior.
              </p>
            </div>
          </div>

          {success ? <div className="alert success">{success}</div> : null}

          <div className="form-grid">
            <div className="field">
              <label htmlFor="outlet-name">Outlet name</label>
              <input
                id="outlet-name"
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </div>
            <div className="field">
              <label htmlFor="outlet-slug">Slug</label>
              <input
                id="outlet-slug"
                onChange={(event) => setSlug(slugify(event.target.value))}
                value={slug}
              />
            </div>
            <div className="field">
              <label htmlFor="outlet-timezone">Timezone</label>
              <input
                id="outlet-timezone"
                onChange={(event) => setTimezone(event.target.value)}
                value={timezone}
              />
            </div>
            <div className="field">
              <label htmlFor="outlet-currency">Currency</label>
              <input
                id="outlet-currency"
                maxLength={3}
                onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                value={currency}
              />
            </div>
            <label className="checkbox-row">
              <input
                checked={gstEnabled}
                onChange={(event) => setGstEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>Enable GST at this outlet</span>
            </label>
            <div className="field">
              <label htmlFor="outlet-gst-rate">GST rate (bps)</label>
              <input
                id="outlet-gst-rate"
                onChange={(event) => setGstRateBps(event.target.value)}
                value={gstRateBps}
              />
            </div>
            <label className="checkbox-row">
              <input
                checked={serviceChargeEnabled}
                onChange={(event) => setServiceChargeEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>Enable service charge at this outlet</span>
            </label>
            <div className="field">
              <label htmlFor="outlet-service-charge">
                Service charge (bps)
              </label>
              <input
                id="outlet-service-charge"
                onChange={(event) => setServiceChargeBps(event.target.value)}
                value={serviceChargeBps}
              />
            </div>
            <div className="field">
              <label htmlFor="outlet-reason">Reason</label>
              <input
                id="outlet-reason"
                onChange={(event) => setReason(event.target.value)}
                value={reason}
              />
            </div>
          </div>

          <div className="action-row">
            <button
              className="primary-button"
              disabled={busy || name.trim().length < 2 || reason.trim().length < 3}
              onClick={() => void handleSave()}
              type="button"
            >
              {busy ? 'Saving outlet...' : 'Save outlet settings'}
            </button>
          </div>
        </section>
      ) : null}
    </OutletPageLayout>
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
