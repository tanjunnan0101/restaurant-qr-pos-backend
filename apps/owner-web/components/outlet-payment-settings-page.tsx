'use client';

import { useEffect, useState } from 'react';
import {
  disablePaymentScope,
  enablePaymentScope,
  getPaymentSettings,
} from '@/lib/api';
import type { PaymentScope, PaymentSettingsResponse } from '@/lib/types';
import {
  OutletHeader,
  OutletPageLayout,
  useOutletContext,
} from './outlet-page-base';

interface ScopeCardDescriptor {
  scope: PaymentScope;
  label: string;
  description: string;
  legacyNote?: string;
}

const PAYMENT_SCOPE_DESCRIPTORS: Record<PaymentScope, ScopeCardDescriptor> = {
  ONLINE: {
    scope: 'ONLINE',
    label: 'Online ordering master switch',
    description:
      'Turns outlet-level online payment availability on or off before any specific method is considered.',
  },
  STRIPE: {
    scope: 'STRIPE',
    label: 'Hosted checkout provider gate',
    description:
      'Still stored in a legacy STRIPE field, but it currently gates the hosted checkout path used by customer payments.',
    legacyNote: 'Backend rename still pending after the HitPay migration.',
  },
  ONLINE_CARD: {
    scope: 'ONLINE_CARD',
    label: 'Card or wallet checkout',
    description:
      'This is the live customer payment method for hosted card or wallet checkout.',
  },
  STRIPE_PAYNOW: {
    scope: 'STRIPE_PAYNOW',
    label: 'Legacy hosted PayNow path',
    description:
      'Deprecated customer path kept only for compatibility with older payment settings data.',
    legacyNote: 'Not used by the current customer checkout flow.',
  },
  MANUAL_PAYNOW: {
    scope: 'MANUAL_PAYNOW',
    label: 'Manual PayNow verification',
    description:
      'Staff-side manual verification flow. It is not exposed in the current customer checkout experience.',
    legacyNote: 'Operational fallback only.',
  },
};

export function OutletPaymentSettingsPage() {
  const {
    outletId,
    session,
    loading,
    outlet,
    error: outletError,
    busy: outletBusy,
  } = useOutletContext();
  const [settings, setSettings] = useState<PaymentSettingsResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [submittingScope, setSubmittingScope] = useState<PaymentScope | null>(
    null,
  );

  async function refreshSettings(authToken: string) {
    const response = await getPaymentSettings(authToken, outletId);
    setSettings(response);
    setError(null);
    return response;
  }

  useEffect(() => {
    if (!session?.accessToken) {
      return;
    }
    const authToken = session.accessToken;

    let cancelled = false;
    async function load() {
      setBusy(true);
      try {
        const response = await getPaymentSettings(authToken, outletId);
        if (!cancelled) {
          setSettings(response);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Failed to load payment settings.',
          );
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [outletId, session]);

  async function handleDisable(input: {
    scope: PaymentScope;
    reason: string;
    until?: string;
  }): Promise<boolean> {
    if (!session?.accessToken) {
      return false;
    }

    setActionError(null);
    setActionSuccess(null);
    setSubmittingScope(input.scope);
    try {
      await disablePaymentScope(session.accessToken, outletId, input);
      await refreshSettings(session.accessToken);
      setActionSuccess(
        `${PAYMENT_SCOPE_DESCRIPTORS[input.scope].label} updated.`,
      );
      return true;
    } catch (submitError) {
      setActionError(
        submitError instanceof Error
          ? submitError.message
          : 'Failed to disable this payment scope.',
      );
      return false;
    } finally {
      setSubmittingScope(null);
    }
  }

  async function handleEnable(input: {
    scope: PaymentScope;
    reason: string;
  }): Promise<boolean> {
    if (!session?.accessToken) {
      return false;
    }

    setActionError(null);
    setActionSuccess(null);
    setSubmittingScope(input.scope);
    try {
      await enablePaymentScope(session.accessToken, outletId, input);
      await refreshSettings(session.accessToken);
      setActionSuccess(
        `${PAYMENT_SCOPE_DESCRIPTORS[input.scope].label} restored.`,
      );
      return true;
    } catch (submitError) {
      setActionError(
        submitError instanceof Error
          ? submitError.message
          : 'Failed to enable this payment scope.',
      );
      return false;
    } finally {
      setSubmittingScope(null);
    }
  }

  const controlCards = settings
    ? [
        {
          ...PAYMENT_SCOPE_DESCRIPTORS.ONLINE,
          configuredEnabled: settings.online.configuredEnabled,
          effectiveEnabled: isToggleEffective(
            settings.online.configuredEnabled,
            settings.online.disabledUntil,
          ),
          disabledUntil: settings.online.disabledUntil,
          reason: settings.online.reason,
        },
        {
          ...PAYMENT_SCOPE_DESCRIPTORS.STRIPE,
          configuredEnabled: settings.stripe.configuredEnabled,
          effectiveEnabled: isToggleEffective(
            settings.stripe.configuredEnabled,
            settings.stripe.disabledUntil,
          ),
          disabledUntil: settings.stripe.disabledUntil,
          reason: settings.stripe.reason,
        },
      ]
    : [];

  return (
    <OutletPageLayout
      title="Payment settings"
      subtitle="Owner controls for live checkout gates and method availability, backed by the existing payment settings APIs."
    >
      {outlet && <OutletHeader outlet={outlet} />}

      <section className="section-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Checkout controls</p>
            <h2 className="serif">Current payment configuration</h2>
            <p>
              This first owner write flow can pause, restore, or temporarily
              schedule payment availability without touching the customer web
              deploy.
            </p>
          </div>
        </div>

        {loading || outletBusy || busy ? (
          <p>Loading payment settings...</p>
        ) : outletError || error ? (
          <div className="alert error">{outletError ?? error}</div>
        ) : !settings ? (
          <div className="empty-state">
            <strong>No payment settings were returned.</strong>
          </div>
        ) : (
          <>
            {actionError && <div className="alert error">{actionError}</div>}
            {actionSuccess && (
              <div className="alert success">{actionSuccess}</div>
            )}

            <div className="detail-grid">
              <article className="dashboard-card">
                <span className="metric-label">Online payments</span>
                <span className="metric-value">
                  {settings.online.configuredEnabled ? 'Configured on' : 'Off'}
                </span>
                <p className="metric-note">
                  {settings.online.reason ?? 'No override reason set.'}
                </p>
              </article>
              <article className="dashboard-card">
                <span className="metric-label">Hosted checkout gate</span>
                <span className="metric-value">
                  {settings.stripe.configuredEnabled ? 'Configured on' : 'Off'}
                </span>
                <p className="metric-note">
                  Legacy internal field still gates the hosted checkout path.
                </p>
              </article>
            </div>

            <div className="list-block">
              {controlCards.map((scope) => (
                <PaymentScopeCard
                  key={scope.scope}
                  configuredEnabled={scope.configuredEnabled}
                  description={scope.description}
                  disabledUntil={scope.disabledUntil}
                  effectiveEnabled={scope.effectiveEnabled}
                  isSubmitting={submittingScope === scope.scope}
                  label={scope.label}
                  legacyNote={scope.legacyNote}
                  reason={scope.reason}
                  scope={scope.scope}
                  onDisable={handleDisable}
                  onEnable={handleEnable}
                />
              ))}

              {settings.methods.map((method) => (
                <PaymentScopeCard
                  key={method.method}
                  configuredEnabled={method.configuredEnabled}
                  description={
                    PAYMENT_SCOPE_DESCRIPTORS[method.method].description
                  }
                  disabledUntil={method.disabledUntil}
                  effectiveEnabled={method.effectiveEnabled}
                  isSubmitting={submittingScope === method.method}
                  label={PAYMENT_SCOPE_DESCRIPTORS[method.method].label}
                  legacyNote={
                    PAYMENT_SCOPE_DESCRIPTORS[method.method].legacyNote
                  }
                  reason={method.reason}
                  scope={method.method}
                  onDisable={handleDisable}
                  onEnable={handleEnable}
                />
              ))}
            </div>
          </>
        )}
      </section>
    </OutletPageLayout>
  );
}

function PaymentScopeCard({
  scope,
  label,
  description,
  legacyNote,
  configuredEnabled,
  effectiveEnabled,
  disabledUntil,
  reason,
  isSubmitting,
  onDisable,
  onEnable,
}: {
  scope: PaymentScope;
  label: string;
  description: string;
  legacyNote?: string;
  configuredEnabled: boolean;
  effectiveEnabled: boolean;
  disabledUntil: string | null;
  reason: string | null;
  isSubmitting: boolean;
  onDisable: (input: {
    scope: PaymentScope;
    reason: string;
    until?: string;
  }) => Promise<boolean>;
  onEnable: (input: {
    scope: PaymentScope;
    reason: string;
  }) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<'disable' | 'enable' | null>(null);
  const [reasonInput, setReasonInput] = useState('');
  const [untilInput, setUntilInput] = useState('');

  const pausedUntil = formatDateTime(disabledUntil);
  const isTemporarilyPaused = Boolean(disabledUntil && !effectiveEnabled);
  const isBlockedUpstream = Boolean(
    configuredEnabled && !disabledUntil && !effectiveEnabled,
  );

  async function submitDisable() {
    if (!reasonInput.trim()) {
      return;
    }
    const success = await onDisable({
      scope,
      reason: reasonInput.trim(),
      until: untilInput ? new Date(untilInput).toISOString() : undefined,
    });
    if (success) {
      setMode(null);
      setReasonInput('');
      setUntilInput('');
    }
  }

  async function submitEnable() {
    if (!reasonInput.trim()) {
      return;
    }
    const success = await onEnable({
      scope,
      reason: reasonInput.trim(),
    });
    if (success) {
      setMode(null);
      setReasonInput('');
    }
  }

  return (
    <article className="list-item">
      <div className="section-header">
        <div>
          <h3>{label}</h3>
          <p>{description}</p>
        </div>
        <div className="badge-row">
          <span className={effectiveEnabled ? 'badge success' : 'badge danger'}>
            {effectiveEnabled ? 'Live' : 'Blocked'}
          </span>
          <span className={configuredEnabled ? 'badge' : 'badge warn'}>
            {configuredEnabled ? 'Configured on' : 'Configured off'}
          </span>
        </div>
      </div>

      <div className="detail-grid">
        <article className="info-card">
          <span className="metric-label">Reason</span>
          <span className="metric-value scope-card-value">
            {reason ?? 'No active override'}
          </span>
          <p className="metric-note">
            {legacyNote ?? 'Owner action is audited through the backend API.'}
          </p>
        </article>
        <article className="info-card">
          <span className="metric-label">Disabled until</span>
          <span className="metric-value scope-card-value">
            {pausedUntil ?? 'No scheduled resume'}
          </span>
          <p className="metric-note">
            {isBlockedUpstream
              ? 'This scope is configured on but currently blocked by a parent checkout gate above.'
              : isTemporarilyPaused
                ? 'This scope is temporarily paused and will recover automatically at the scheduled time.'
                : 'Use a future time to schedule an automatic recovery.'}
          </p>
        </article>
      </div>

      <div className="action-row">
        {configuredEnabled && !isTemporarilyPaused ? (
          <button
            className="secondary-button"
            disabled={isSubmitting}
            onClick={() => setMode(mode === 'disable' ? null : 'disable')}
            type="button"
          >
            {mode === 'disable' ? 'Close' : 'Pause or disable'}
          </button>
        ) : (
          <button
            className="primary-button"
            disabled={isSubmitting}
            onClick={() => setMode(mode === 'enable' ? null : 'enable')}
            type="button"
          >
            {mode === 'enable'
              ? 'Close'
              : isTemporarilyPaused
                ? 'Restore now'
                : 'Enable'}
          </button>
        )}
      </div>

      {mode && (
        <div className="control-panel">
          <div className="form-grid">
            <div className="field">
              <label htmlFor={`${scope}-reason`}>
                {mode === 'disable'
                  ? 'Reason for shutdown'
                  : 'Reason for restore'}
              </label>
              <textarea
                id={`${scope}-reason`}
                onChange={(event) => setReasonInput(event.target.value)}
                placeholder={
                  mode === 'disable'
                    ? 'Explain the outage, maintenance, or business decision.'
                    : 'Record why this payment path is being restored.'
                }
                rows={3}
                value={reasonInput}
              />
            </div>

            {mode === 'disable' && (
              <div className="field">
                <label htmlFor={`${scope}-until`}>
                  Resume automatically at (optional)
                </label>
                <input
                  id={`${scope}-until`}
                  min={toDateTimeLocalValue(new Date())}
                  onChange={(event) => setUntilInput(event.target.value)}
                  type="datetime-local"
                  value={untilInput}
                />
              </div>
            )}

            <div className="action-row">
              <button
                className={
                  mode === 'disable' ? 'primary-button' : 'secondary-button'
                }
                disabled={isSubmitting || !reasonInput.trim()}
                onClick={() =>
                  void (mode === 'disable' ? submitDisable() : submitEnable())
                }
                type="button"
              >
                {isSubmitting
                  ? 'Saving...'
                  : mode === 'disable'
                    ? 'Apply shutdown'
                    : 'Restore availability'}
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function isToggleEffective(
  configuredEnabled: boolean,
  disabledUntil: string | null,
): boolean {
  if (!configuredEnabled) {
    return false;
  }
  if (!disabledUntil) {
    return true;
  }
  return new Date(disabledUntil).getTime() <= Date.now();
}

function formatDateTime(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function toDateTimeLocalValue(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
