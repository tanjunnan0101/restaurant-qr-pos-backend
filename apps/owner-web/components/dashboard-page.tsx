'use client';

import {
  AlertTriangle,
  Building2,
  ClipboardList,
  Printer,
  Sparkles,
  WalletCards,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  createOutlet,
  getCurrentCompany,
  getCompanyAuditLogs,
  getMenus,
  getOrders,
  getOutlets,
  getPaymentSettings,
  getPrinting,
  getTables,
  updateCurrentCompany,
} from '@/lib/api';
import type {
  CompanyProfile,
  OutletAuditEntry,
  OutletDashboardData,
} from '@/lib/types';
import { OwnerPageFrame } from './owner-page-frame';
import { useOwnerSession } from './owner-session-guard';

export function DashboardPage() {
  const { session, loading } = useOwnerSession();
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [companyAudit, setCompanyAudit] = useState<OutletAuditEntry[]>([]);
  const [outlets, setOutlets] = useState<OutletDashboardData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [companyBusy, setCompanyBusy] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [companyError, setCompanyError] = useState<string | null>(null);
  const [companySuccess, setCompanySuccess] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [defaultCurrency, setDefaultCurrency] = useState('SGD');
  const [defaultTimezone, setDefaultTimezone] = useState('Asia/Singapore');
  const [companyReason, setCompanyReason] = useState(
    'Updated company settings from the owner dashboard.',
  );
  const [outletName, setOutletName] = useState('');
  const [outletSlug, setOutletSlug] = useState('');
  const [outletSlugTouched, setOutletSlugTouched] = useState(false);
  const [timezone, setTimezone] = useState('Asia/Singapore');
  const [currency, setCurrency] = useState('SGD');
  const [gstEnabled, setGstEnabled] = useState(true);
  const [gstRateBps, setGstRateBps] = useState('900');
  const [serviceChargeEnabled, setServiceChargeEnabled] = useState(false);
  const [serviceChargeBps, setServiceChargeBps] = useState('1000');

  async function loadDashboard(authToken: string) {
    const [companyData, outletList, companyAuditResponse] = await Promise.all([
      getCurrentCompany(authToken),
      getOutlets(authToken),
      getCompanyAuditLogs(authToken, { limit: 8 }),
    ]);

    const summaries = await Promise.all(
      outletList.map(async (outlet) => {
        const [menus, tables, paymentSettings, printing, orders] =
          await Promise.all([
            getMenus(authToken, outlet.id),
            getTables(authToken, outlet.id),
            getPaymentSettings(authToken, outlet.id),
            getPrinting(authToken, outlet.id),
            getOrders(authToken, outlet.id),
          ]);

        const latestPublishedVersion =
          menus
            .flatMap((menu) => menu.versions)
            .find((version) => version.status === 'PUBLISHED')?.versionNumber ??
          null;
        const tableCount = tables.reduce(
          (total, zone) => total + zone.tables.length,
          0,
        );
        const qrCount = tables.reduce(
          (total, zone) =>
            total +
            zone.tables.reduce(
              (zoneTotal, table) => zoneTotal + table.qrCodes.length,
              0,
            ),
          0,
        );
        const totalOrders = orders.length;
        const liveOrders = orders.filter((order) =>
          ['PAID', 'SENT_TO_KITCHEN', 'PREPARING', 'READY', 'SERVED'].includes(
            order.status,
          ),
        ).length;
        const paidOrders = orders.filter(
          (order) => order.paymentStatus === 'PAID',
        ).length;
        const grossSalesCents = orders
          .filter((order) => order.paymentStatus === 'PAID')
          .reduce((sum, order) => sum + order.grandTotalCents, 0);
        const setupChecklist = {
          menuPublished: latestPublishedVersion !== null,
          tablesReady: tableCount > 0 && qrCount > 0,
          checkoutReady:
            paymentSettings.online.configuredEnabled &&
            (paymentSettings.methods.find(
              (method) => method.method === 'ONLINE_CARD',
            )?.effectiveEnabled ??
              false),
          printingReady: printing.printers.length > 0,
        };
        const setupReadinessPercent = Math.round(
          (Object.values(setupChecklist).filter(Boolean).length /
            Object.keys(setupChecklist).length) *
            100,
        );

        return {
          outlet,
          menuCount: menus.length,
          latestMenuVersion:
            latestPublishedVersion === null ? null : `v${latestPublishedVersion}`,
          totalOrders,
          liveOrders,
          paidOrders,
          grossSalesCents,
          zoneCount: tables.length,
          tableCount,
          qrCount,
          onlineEnabled: paymentSettings.online.configuredEnabled,
          onlineCardEnabled:
            paymentSettings.methods.find(
              (method) => method.method === 'ONLINE_CARD',
            )?.effectiveEnabled ?? false,
          printerCount: printing.printers.length,
          agentCount: printing.agents.length,
          failedPrintJobs: printing.failedJobs.length,
          setupReadinessPercent,
          setupChecklist,
        } satisfies OutletDashboardData;
      }),
    );

    return {
      companyData,
      summaries,
      companyAuditEntries: companyAuditResponse.entries,
    };
  }

  useEffect(() => {
    if (!session?.accessToken) {
      return;
    }
    const authToken = session.accessToken;

    let cancelled = false;

    async function load() {
      setBusy(true);
      setError(null);
      try {
        const { companyData, summaries, companyAuditEntries } =
          await loadDashboard(authToken);

        if (!cancelled) {
          setCompany(companyData);
          setCompanyName(companyData.name);
          setLegalName(companyData.legalName ?? '');
          setRegistrationNumber(companyData.registrationNumber ?? '');
          setDefaultCurrency(companyData.defaultCurrency);
          setDefaultTimezone(companyData.defaultTimezone);
          setOutlets(summaries);
          setCompanyAudit(companyAuditEntries);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Dashboard failed to load.',
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
  }, [session]);

  async function handleCreateOutlet() {
    if (!session?.accessToken) {
      return;
    }

    setCreateBusy(true);
    setCreateError(null);
    setCreateSuccess(null);

    try {
      const created = await createOutlet(session.accessToken, {
        name: outletName.trim(),
        slug: outletSlug.trim(),
        timezone: timezone.trim(),
        currency: currency.trim().toUpperCase(),
        gstEnabled,
        gstRateBps: Number.parseInt(gstRateBps, 10),
        serviceChargeEnabled,
        serviceChargeBps: Number.parseInt(serviceChargeBps, 10),
      });
      const { companyData, summaries, companyAuditEntries } = await loadDashboard(
        session.accessToken,
      );
      setCompany(companyData);
      setOutlets(summaries);
      setCompanyAudit(companyAuditEntries);
      setCreateSuccess(`${created.name} is ready for setup.`);
      setOutletName('');
      setOutletSlug('');
      setOutletSlugTouched(false);
      setTimezone('Asia/Singapore');
      setCurrency('SGD');
      setGstEnabled(true);
      setGstRateBps('900');
      setServiceChargeEnabled(false);
      setServiceChargeBps('1000');
    } catch (submitError) {
      setCreateError(
        submitError instanceof Error
          ? submitError.message
          : 'Failed to create outlet.',
      );
    } finally {
      setCreateBusy(false);
    }
  }

  function handleOutletNameChange(value: string) {
    setOutletName(value);
    if (!outletSlugTouched) {
      setOutletSlug(slugify(value));
    }
  }

  function handleOutletSlugChange(value: string) {
    setOutletSlugTouched(true);
    setOutletSlug(slugify(value));
  }

  async function handleUpdateCompany() {
    if (!session?.accessToken) {
      return;
    }

    setCompanyBusy(true);
    setCompanyError(null);
    setCompanySuccess(null);

    try {
      const [updated, companyAuditResponse] = await Promise.all([
        updateCurrentCompany(session.accessToken, {
          name: companyName.trim(),
          legalName: legalName.trim() || undefined,
          registrationNumber: registrationNumber.trim() || undefined,
          defaultCurrency: defaultCurrency.trim().toUpperCase(),
          defaultTimezone: defaultTimezone.trim(),
          reason: companyReason.trim(),
        }),
        getCompanyAuditLogs(session.accessToken, { limit: 8 }),
      ]);
      setCompany(updated);
      setCompanyName(updated.name);
      setLegalName(updated.legalName ?? '');
      setRegistrationNumber(updated.registrationNumber ?? '');
      setDefaultCurrency(updated.defaultCurrency);
      setDefaultTimezone(updated.defaultTimezone);
      setCompanyAudit(companyAuditResponse.entries);
      setCompanySuccess('Company settings updated.');
    } catch (submitError) {
      setCompanyError(
        submitError instanceof Error
          ? submitError.message
          : 'Failed to update company settings.',
      );
    } finally {
      setCompanyBusy(false);
    }
  }

  const companyMetrics = useMemo(() => {
    const totalPaidSales = outlets.reduce(
      (sum, outlet) => sum + outlet.grossSalesCents,
      0,
    );
    const totalLiveOrders = outlets.reduce(
      (sum, outlet) => sum + outlet.liveOrders,
      0,
    );
    const averageSetupReadiness =
      outlets.length > 0
        ? Math.round(
            outlets.reduce(
              (sum, outlet) => sum + outlet.setupReadinessPercent,
              0,
            ) / outlets.length,
          )
        : 0;
    const totalFailedPrintJobs = outlets.reduce(
      (sum, outlet) => sum + outlet.failedPrintJobs,
      0,
    );

    return {
      totalPaidSales,
      totalLiveOrders,
      averageSetupReadiness,
      totalFailedPrintJobs,
    };
  }, [outlets]);

  const rankedOutlets = useMemo(
    () =>
      [...outlets]
        .sort((left, right) => {
          if (right.grossSalesCents !== left.grossSalesCents) {
            return right.grossSalesCents - left.grossSalesCents;
          }
          return right.totalOrders - left.totalOrders;
        })
        .slice(0, 5),
    [outlets],
  );

  const attentionOutlets = useMemo(
    () =>
      outlets
        .map((outlet) => ({
          outlet,
          alerts: buildOutletAlerts(outlet),
        }))
        .filter((entry) => entry.alerts.length > 0)
        .sort((left, right) => right.alerts.length - left.alerts.length)
        .slice(0, 5),
    [outlets],
  );

  const companyExportSummary = useMemo(() => {
    const topOutlet = rankedOutlets[0];
    const topAttention = attentionOutlets[0];
    return [
      'Company owner summary',
      `Company: ${company?.name ?? 'Unknown company'}`,
      `Outlets: ${outlets.length}`,
      `Total paid sales: ${formatCurrency(company?.defaultCurrency ?? 'SGD', companyMetrics.totalPaidSales)}`,
      `Live orders: ${companyMetrics.totalLiveOrders}`,
      `Average setup readiness: ${companyMetrics.averageSetupReadiness}%`,
      `Failed print jobs: ${companyMetrics.totalFailedPrintJobs}`,
      `Top outlet: ${
        topOutlet
          ? `${topOutlet.outlet.name} (${formatCurrency(topOutlet.outlet.currency, topOutlet.grossSalesCents)})`
          : 'No outlet activity'
      }`,
      `Needs attention: ${
        topAttention
          ? `${topAttention.outlet.outlet.name} (${topAttention.alerts.join(', ')})`
          : 'No major operational alerts'
      }`,
      `Latest company audit items: ${companyAudit.length}`,
    ].join('\n');
  }, [
    attentionOutlets,
    company,
    companyAudit.length,
    companyMetrics,
    outlets.length,
    rankedOutlets,
  ]);

  const launchWatchlist = useMemo(
    () =>
      outlets
        .map((entry) => ({
          entry,
          blockers: [
            entry.setupChecklist.menuPublished ? null : 'Publish the menu',
            entry.setupChecklist.tablesReady ? null : 'Finish table and QR setup',
            entry.setupChecklist.checkoutReady ? null : 'Enable online card checkout',
            entry.setupChecklist.printingReady
              ? null
              : 'Validate printer and receipt routing',
          ].filter((value): value is string => value !== null),
        }))
        .sort((left, right) => left.blockers.length - right.blockers.length)
        .slice(0, 4),
    [outlets],
  );

  async function handleCopyCompanySummary() {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      setCopySuccess('Copy is not available in this browser.');
      return;
    }
    try {
      await navigator.clipboard.writeText(companyExportSummary);
      setCopySuccess('Company summary copied to clipboard.');
    } catch {
      setCopySuccess('Copy failed. You can still select and copy manually.');
    }
  }

  return (
    <OwnerPageFrame
      title="Dashboard"
      subtitle="Read-only owner overview powered by the current backend APIs."
    >
      {loading || busy ? (
        <section className="section-panel">
          <p className="eyebrow">Hydrating</p>
          <h2 className="serif">Loading company and outlet data...</h2>
          <p>
            This first cut pulls company, menu, table, payment, and printing
            data directly from the existing API.
          </p>
        </section>
      ) : error ? (
        <section className="section-panel">
          <div className="alert error">{error}</div>
        </section>
      ) : (
        <>
          {company && (
            <section className="section-panel hero-panel">
              <div className="hero-panel__header">
                <div className="hero-panel__copy">
                  <p className="eyebrow">Company profile</p>
                  <h2 className="serif hero-panel__title">{company.name}</h2>
                  <p className="hero-panel__lede">
                    {company.slug} | {company.defaultCurrency} |{' '}
                    {company.defaultTimezone}
                  </p>
                  <div className="badge-row">
                    <span className="badge">{company.status}</span>
                    {company.legalName ? (
                      <span className="tag">{company.legalName}</span>
                    ) : null}
                    {company.registrationNumber ? (
                      <span className="tag">{company.registrationNumber}</span>
                    ) : null}
                  </div>
                </div>

                <div className="hero-panel__spotlight">
                  <article className="spotlight-card spotlight-card--success">
                    <span className="spotlight-card__icon">
                      <Building2 aria-hidden="true" size={18} />
                    </span>
                    <div>
                      <span className="metric-label">Top grossing outlet</span>
                      <strong className="spotlight-card__value">
                        {rankedOutlets[0]?.outlet.name ?? 'No outlet activity'}
                      </strong>
                      <p className="metric-note">
                        {rankedOutlets[0]
                          ? formatCurrency(
                              rankedOutlets[0].outlet.currency,
                              rankedOutlets[0].grossSalesCents,
                            )
                          : 'Run the first live orders to rank outlet performance.'}
                      </p>
                    </div>
                  </article>
                  <article className="spotlight-card spotlight-card--warn">
                    <span className="spotlight-card__icon">
                      <AlertTriangle aria-hidden="true" size={18} />
                    </span>
                    <div>
                      <span className="metric-label">Needs attention</span>
                      <strong className="spotlight-card__value">
                        {attentionOutlets[0]?.outlet.outlet.name ?? 'No critical alerts'}
                      </strong>
                      <p className="metric-note">
                        {attentionOutlets[0]
                          ? attentionOutlets[0].alerts.join(', ')
                          : 'All tracked outlet launch checks currently look healthy.'}
                      </p>
                    </div>
                  </article>
                </div>
              </div>

              <div className="dashboard-stats dashboard-stats--hero">
                <article className="dashboard-card dashboard-card--hero">
                  <span className="metric-label">Outlets</span>
                  <span className="metric-value">{outlets.length}</span>
                  <p className="metric-note">All accessible operating locations</p>
                </article>
                <article className="dashboard-card dashboard-card--hero">
                  <span className="metric-label">Menus</span>
                  <span className="metric-value">
                    {outlets.reduce((sum, outlet) => sum + outlet.menuCount, 0)}
                  </span>
                  <p className="metric-note">Total configured owner-side menus</p>
                </article>
                <article className="dashboard-card dashboard-card--hero">
                  <span className="metric-label">Orders</span>
                  <span className="metric-value">
                    {outlets.reduce(
                      (sum, outlet) => sum + outlet.totalOrders,
                      0,
                    )}
                  </span>
                  <p className="metric-note">All recorded orders across the tenant</p>
                </article>
                <article className="dashboard-card dashboard-card--hero">
                  <span className="metric-label">Paid sales</span>
                  <span className="metric-value">
                    {formatCurrency(
                      company.defaultCurrency,
                      outlets.reduce(
                        (sum, outlet) => sum + outlet.grossSalesCents,
                        0,
                      ),
                    )}
                  </span>
                  <p className="metric-note">Gross paid value across all outlets</p>
                </article>
              </div>
            </section>
          )}

          <section className="section-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Operations pulse</p>
                <h2 className="serif">Company performance board</h2>
                <p>
                  Spot the strongest outlets and the ones that need owner
                  follow-up before service quality slips.
                </p>
              </div>
            </div>

            <div className="dashboard-stats">
              <article className="dashboard-card dashboard-card--tone-accent">
                <span className="metric-label">Live orders</span>
                <span className="metric-icon">
                  <ClipboardList aria-hidden="true" size={18} />
                </span>
                <span className="metric-value">
                  {companyMetrics.totalLiveOrders}
                </span>
                <p className="metric-note">Across all outlets right now</p>
              </article>
              <article className="dashboard-card dashboard-card--tone-success">
                <span className="metric-label">Average readiness</span>
                <span className="metric-icon">
                  <Sparkles aria-hidden="true" size={18} />
                </span>
                <span className="metric-value">
                  {companyMetrics.averageSetupReadiness}%
                </span>
                <p className="metric-note">Mean go-live readiness score</p>
              </article>
              <article className="dashboard-card dashboard-card--tone-danger">
                <span className="metric-label">Print failures</span>
                <span className="metric-icon">
                  <Printer aria-hidden="true" size={18} />
                </span>
                <span className="metric-value">
                  {companyMetrics.totalFailedPrintJobs}
                </span>
                <p className="metric-note">Failed print jobs awaiting review</p>
              </article>
              <article className="dashboard-card dashboard-card--tone-neutral">
                <span className="metric-label">Paid revenue</span>
                <span className="metric-icon">
                  <WalletCards aria-hidden="true" size={18} />
                </span>
                <span className="metric-value">
                  {formatCurrency(
                    company?.defaultCurrency ?? 'SGD',
                    companyMetrics.totalPaidSales,
                  )}
                </span>
                <p className="metric-note">
                  Revenue already settled through the current ordering flows
                </p>
              </article>
            </div>

            <div className="outlet-grid">
              <article className="list-item list-item--elevated">
                <h3>Top outlets</h3>
                <div className="list-block">
                  {rankedOutlets.length === 0 ? (
                    <p className="muted">No outlet performance data yet.</p>
                  ) : (
                    rankedOutlets.map((entry, index) => (
                      <div className="split-line" key={entry.outlet.id}>
                        <span>
                          {index + 1}. {entry.outlet.name}
                        </span>
                        <strong>
                          {formatCurrency(
                            entry.outlet.currency,
                            entry.grossSalesCents,
                          )}
                        </strong>
                      </div>
                    ))
                  )}
                </div>
              </article>

              <article className="list-item list-item--elevated">
                <h3>Attention needed</h3>
                <div className="list-block">
                  {attentionOutlets.length === 0 ? (
                    <p className="muted">No urgent operational alerts.</p>
                  ) : (
                    attentionOutlets.map((entry) => (
                      <div className="split-line" key={entry.outlet.outlet.id}>
                        <span>{entry.outlet.outlet.name}</span>
                        <strong>{entry.alerts.join(', ')}</strong>
                      </div>
                    ))
                  )}
                </div>
              </article>
            </div>
          </section>

          <section className="section-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Launch watchlist</p>
                <h2 className="serif">Where to push next</h2>
                <p>
                  These outlet cards compress setup blockers into a quick owner
                  view so rollout decisions do not get buried inside forms.
                </p>
              </div>
            </div>

            <div className="outlet-grid">
              {launchWatchlist.length === 0 ? (
                <div className="empty-state">
                  <strong>No outlets yet.</strong>
                  <p>Create the first outlet to start the setup sequence.</p>
                </div>
              ) : (
                launchWatchlist.map(({ entry, blockers }) => (
                  <article className="list-item list-item--spotlight" key={entry.outlet.id}>
                    <div className="section-header">
                      <div>
                        <h3>{entry.outlet.name}</h3>
                        <p>
                          {entry.outlet.slug} | {entry.outlet.currency} |{' '}
                          {entry.outlet.timezone}
                        </p>
                      </div>
                      <span
                        className={
                          blockers.length === 0 ? 'badge success' : 'badge warn'
                        }
                      >
                        {blockers.length === 0
                          ? 'Ready for rollout'
                          : `${blockers.length} remaining`}
                      </span>
                    </div>

                    <div className="detail-grid">
                      <article className="info-card info-card--compact">
                        <span className="metric-label">Readiness</span>
                        <span className="metric-value">
                          {entry.setupReadinessPercent}%
                        </span>
                        <p className="metric-note">
                          {entry.onlineCardEnabled
                            ? 'Checkout is live for QR ordering'
                            : 'Checkout still needs attention'}
                        </p>
                      </article>
                      <article className="info-card info-card--compact">
                        <span className="metric-label">Live orders</span>
                        <span className="metric-value">{entry.liveOrders}</span>
                        <p className="metric-note">
                          {entry.paidOrders} paid | {entry.totalOrders} total
                        </p>
                      </article>
                    </div>

                    <ul className="sub-list">
                      {blockers.length === 0 ? (
                        <li>Everything required for pilot handoff is in place.</li>
                      ) : (
                        blockers.map((blocker) => <li key={blocker}>{blocker}</li>)
                      )}
                    </ul>

                    <div className="inline-actions">
                      <Link
                        className="secondary-button"
                        href={`/outlets/${entry.outlet.id}/reports`}
                      >
                        View outlet
                      </Link>
                      <Link
                        className="secondary-button"
                        href={`/outlets/${entry.outlet.id}/payment-settings`}
                      >
                        Payment controls
                      </Link>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="section-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Owner export</p>
                <h2 className="serif">Company summary block</h2>
                <p>
                  Copy this summary into a rollout update, investor note, or
                  team handoff without waiting for external reporting tooling.
                </p>
              </div>
              <button
                className="secondary-button"
                onClick={() => void handleCopyCompanySummary()}
                type="button"
              >
                Copy company summary
              </button>
            </div>

            {copySuccess ? <div className="alert success">{copySuccess}</div> : null}

            <div className="field">
              <label htmlFor="company-export-summary">Summary text</label>
              <textarea
                id="company-export-summary"
                readOnly
                rows={10}
                value={companyExportSummary}
              />
            </div>
          </section>

          <section className="section-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Company settings</p>
                <h2 className="serif">Business profile</h2>
                <p>
                  Keep the legal and operating defaults current here so new
                  outlets and reports inherit the right business context.
                </p>
              </div>
            </div>

            {companyError ? <div className="alert error">{companyError}</div> : null}
            {companySuccess ? (
              <div className="alert success">{companySuccess}</div>
            ) : null}

            <div className="form-grid">
              <div className="field">
                <label htmlFor="company-name">Business name</label>
                <input
                  id="company-name"
                  onChange={(event) => setCompanyName(event.target.value)}
                  value={companyName}
                />
              </div>
              <div className="field">
                <label htmlFor="company-slug">Company slug</label>
                <input disabled id="company-slug" value={company?.slug ?? ''} />
              </div>
              <div className="field">
                <label htmlFor="company-legal-name">Legal name</label>
                <input
                  id="company-legal-name"
                  onChange={(event) => setLegalName(event.target.value)}
                  value={legalName}
                />
              </div>
              <div className="field">
                <label htmlFor="company-registration-number">
                  Registration number
                </label>
                <input
                  id="company-registration-number"
                  onChange={(event) => setRegistrationNumber(event.target.value)}
                  value={registrationNumber}
                />
              </div>
              <div className="field">
                <label htmlFor="company-default-currency">Default currency</label>
                <input
                  id="company-default-currency"
                  maxLength={3}
                  onChange={(event) =>
                    setDefaultCurrency(event.target.value.toUpperCase())
                  }
                  value={defaultCurrency}
                />
              </div>
              <div className="field">
                <label htmlFor="company-default-timezone">Default timezone</label>
                <input
                  id="company-default-timezone"
                  onChange={(event) => setDefaultTimezone(event.target.value)}
                  value={defaultTimezone}
                />
              </div>
              <div className="field">
                <label htmlFor="company-update-reason">Reason</label>
                <input
                  id="company-update-reason"
                  onChange={(event) => setCompanyReason(event.target.value)}
                  value={companyReason}
                />
              </div>
            </div>

            <div className="action-row">
              <button
                className="primary-button"
                disabled={
                  companyBusy ||
                  companyName.trim().length < 2 ||
                  companyReason.trim().length < 3
                }
                onClick={() => void handleUpdateCompany()}
                type="button"
              >
                {companyBusy ? 'Saving company...' : 'Save company settings'}
              </button>
            </div>
          </section>

          <section className="section-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Expansion</p>
                <h2 className="serif">Create a new outlet</h2>
                <p>
                  Provision a fresh outlet shell with payment defaults and owner
                  access, then continue setup through menu, tables, staff, and
                  printing.
                </p>
              </div>
            </div>

            {createError ? <div className="alert error">{createError}</div> : null}
            {createSuccess ? (
              <div className="alert success">{createSuccess}</div>
            ) : null}

            <div className="form-grid">
              <div className="field">
                <label htmlFor="new-outlet-name">Outlet name</label>
                <input
                  id="new-outlet-name"
                  onChange={(event) => handleOutletNameChange(event.target.value)}
                  placeholder="Orchard Outlet"
                  value={outletName}
                />
              </div>
              <div className="field">
                <label htmlFor="new-outlet-slug">Slug</label>
                <input
                  id="new-outlet-slug"
                  onChange={(event) => handleOutletSlugChange(event.target.value)}
                  placeholder="orchard"
                  value={outletSlug}
                />
              </div>
              <div className="field">
                <label htmlFor="new-outlet-timezone">Timezone</label>
                <input
                  id="new-outlet-timezone"
                  onChange={(event) => setTimezone(event.target.value)}
                  value={timezone}
                />
              </div>
              <div className="field">
                <label htmlFor="new-outlet-currency">Currency</label>
                <input
                  id="new-outlet-currency"
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
                <span>Enable GST for this outlet</span>
              </label>
              <div className="field">
                <label htmlFor="new-outlet-gst-rate">GST rate (bps)</label>
                <input
                  id="new-outlet-gst-rate"
                  onChange={(event) => setGstRateBps(event.target.value)}
                  value={gstRateBps}
                />
              </div>
              <label className="checkbox-row">
                <input
                  checked={serviceChargeEnabled}
                  onChange={(event) =>
                    setServiceChargeEnabled(event.target.checked)
                  }
                  type="checkbox"
                />
                <span>Enable service charge for this outlet</span>
              </label>
              <div className="field">
                <label htmlFor="new-outlet-service-charge">
                  Service charge (bps)
                </label>
                <input
                  id="new-outlet-service-charge"
                  onChange={(event) => setServiceChargeBps(event.target.value)}
                  value={serviceChargeBps}
                />
              </div>
            </div>

            <div className="action-row">
              <button
                className="primary-button"
                disabled={
                  createBusy ||
                  outletName.trim().length < 2 ||
                  outletSlug.trim().length < 2
                }
                onClick={() => void handleCreateOutlet()}
                type="button"
              >
                {createBusy ? 'Creating outlet...' : 'Create outlet'}
              </button>
            </div>
          </section>

          <section className="section-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Outlet overview</p>
                <h2 className="serif">Configured outlets</h2>
                <p>
                  Each card is hydrated from existing list endpoints so the
                  owner can see menu, table, payment, and printing readiness at
                  a glance.
                </p>
              </div>
            </div>

            <div className="outlet-grid">
              {outlets.map((entry) => (
                <article className="list-item" key={entry.outlet.id}>
                  <div className="section-header">
                    <div>
                      <h3>{entry.outlet.name}</h3>
                      <p>
                        {entry.outlet.slug} | {entry.outlet.currency} |{' '}
                        {entry.outlet.timezone}
                      </p>
                    </div>
                    <div className="badge-row">
                      <span className="tag">
                        Setup {entry.setupReadinessPercent}%
                      </span>
                      <span
                        className={
                          entry.onlineCardEnabled
                            ? 'badge success'
                            : 'badge danger'
                        }
                      >
                        {entry.onlineCardEnabled
                          ? 'Checkout live'
                          : 'Checkout off'}
                      </span>
                    </div>
                  </div>

                  <div className="detail-grid">
                    <article className="info-card">
                      <span className="metric-label">Go-live readiness</span>
                      <span className="metric-value">
                        {entry.setupReadinessPercent}%
                      </span>
                      <p className="metric-note">
                        {readinessSummary(entry.setupChecklist)}
                      </p>
                    </article>
                    <article className="info-card">
                      <span className="metric-label">Orders</span>
                      <span className="metric-value">{entry.totalOrders}</span>
                      <p className="metric-note">
                        {entry.liveOrders} live now | {entry.paidOrders} paid
                      </p>
                    </article>
                    <article className="info-card">
                      <span className="metric-label">Sales</span>
                      <span className="metric-value">
                        {formatCurrency(
                          entry.outlet.currency,
                          entry.grossSalesCents,
                        )}
                      </span>
                      <p className="metric-note">
                        Gross value from paid orders
                      </p>
                    </article>
                    <article className="info-card">
                      <span className="metric-label">Menus</span>
                      <span className="metric-value">{entry.menuCount}</span>
                      <p className="metric-note">
                        Latest published {entry.latestMenuVersion ?? 'none'}
                      </p>
                    </article>
                    <article className="info-card">
                      <span className="metric-label">Tables</span>
                      <span className="metric-value">{entry.tableCount}</span>
                      <p className="metric-note">
                        {entry.zoneCount} zones | {entry.qrCount} active QR codes
                      </p>
                    </article>
                    <article className="info-card">
                      <span className="metric-label">Printing</span>
                      <span className="metric-value">{entry.printerCount}</span>
                      <p className="metric-note">
                        {entry.agentCount} agents | {entry.failedPrintJobs} failed
                        jobs
                      </p>
                    </article>
                  </div>

                  <div className="tag-row">
                    <span
                      className={
                        entry.setupChecklist.menuPublished ? 'badge success' : 'badge warn'
                      }
                    >
                      {entry.setupChecklist.menuPublished
                        ? 'Menu published'
                        : 'Publish menu'}
                    </span>
                    <span
                      className={
                        entry.setupChecklist.tablesReady ? 'badge success' : 'badge warn'
                      }
                    >
                      {entry.setupChecklist.tablesReady
                        ? 'Tables and QR ready'
                        : 'Set up tables'}
                    </span>
                    <span
                      className={
                        entry.setupChecklist.checkoutReady ? 'badge success' : 'badge warn'
                      }
                    >
                      {entry.setupChecklist.checkoutReady
                        ? 'Checkout ready'
                        : 'Enable checkout'}
                    </span>
                    <span
                      className={
                        entry.setupChecklist.printingReady ? 'badge success' : 'badge warn'
                      }
                    >
                      {entry.setupChecklist.printingReady
                        ? 'Printing configured'
                        : 'Configure printing'}
                    </span>
                  </div>

                  <div className="inline-actions">
                    <Link
                      className="secondary-button"
                      href={`/outlets/${entry.outlet.id}/settings`}
                    >
                      Settings
                    </Link>
                    <Link
                      className="secondary-button"
                      href={`/outlets/${entry.outlet.id}/reports`}
                    >
                      Reports
                    </Link>
                    <Link
                      className="secondary-button"
                      href={`/outlets/${entry.outlet.id}/menu`}
                    >
                      Menu
                    </Link>
                    <Link
                      className="secondary-button"
                      href={`/outlets/${entry.outlet.id}/tables`}
                    >
                      Tables
                    </Link>
                    <Link
                      className="secondary-button"
                      href={`/outlets/${entry.outlet.id}/payment-settings`}
                    >
                      Payment settings
                    </Link>
                    <Link
                      className="secondary-button"
                      href={`/outlets/${entry.outlet.id}/staff`}
                    >
                      Staff
                    </Link>
                    <Link
                      className="secondary-button"
                      href={`/outlets/${entry.outlet.id}/audit`}
                    >
                      Audit
                    </Link>
                    <Link
                      className="secondary-button"
                      href={`/outlets/${entry.outlet.id}/printing`}
                    >
                      Printing
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="section-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Recent activity</p>
                <h2 className="serif">Company audit feed</h2>
                <p>
                  The latest audited changes across company, outlets, staffing,
                  payments, menus, tables, and printing.
                </p>
              </div>
            </div>

            <div className="list-block">
              {companyAudit.length === 0 ? (
                <div className="empty-state">
                  <strong>No recent audit activity yet.</strong>
                </div>
              ) : (
                companyAudit.map((entry) => (
                  <article className="list-item" key={entry.id}>
                    <div className="section-header">
                      <div>
                        <h3>{entry.actionType}</h3>
                        <p>
                          {entry.actor?.fullName ?? 'System'} |{' '}
                          {entry.outlet?.name ?? 'Company scope'}
                        </p>
                      </div>
                      <div className="badge-row">
                        <span className="badge">{entry.entityType}</span>
                        {entry.outlet ? (
                          <Link
                            className="tag"
                            href={`/outlets/${entry.outlet.id}/audit`}
                          >
                            {entry.outlet.slug}
                          </Link>
                        ) : null}
                      </div>
                    </div>
                    <p>{entry.reason ?? 'No reason supplied.'}</p>
                    <p className="metric-note">
                      {formatDateTime(entry.createdAt)}
                    </p>
                  </article>
                ))
              )}
            </div>
          </section>
        </>
      )}
    </OwnerPageFrame>
  );
}

function formatCurrency(currency: string, cents: number) {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function buildOutletAlerts(outlet: OutletDashboardData) {
  const alerts: string[] = [];
  if (!outlet.onlineCardEnabled) {
    alerts.push('checkout off');
  }
  if (outlet.failedPrintJobs > 0) {
    alerts.push(`${outlet.failedPrintJobs} print failures`);
  }
  if (outlet.setupReadinessPercent < 100) {
    alerts.push(`${outlet.setupReadinessPercent}% ready`);
  }
  if (outlet.liveOrders >= 5) {
    alerts.push('high live order load');
  }
  return alerts;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function readinessSummary(checklist: OutletDashboardData['setupChecklist']) {
  const blockers: string[] = [];
  if (!checklist.menuPublished) {
    blockers.push('menu');
  }
  if (!checklist.tablesReady) {
    blockers.push('tables');
  }
  if (!checklist.checkoutReady) {
    blockers.push('checkout');
  }
  if (!checklist.printingReady) {
    blockers.push('printing');
  }
  return blockers.length === 0
    ? 'Ready for end-to-end outlet testing.'
    : `Missing ${blockers.join(', ')} before pilot handoff.`;
}
