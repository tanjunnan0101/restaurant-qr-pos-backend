'use client';

import { useEffect, useMemo, useState } from 'react';
import { getOrders } from '@/lib/api';
import type { OwnerOrderListEntry, OwnerOrderStatus } from '@/lib/types';
import {
  OutletHeader,
  OutletPageLayout,
  useOutletContext,
} from './outlet-page-base';

type TimeWindow = '24H' | '7D' | '30D' | 'ALL';

const TIME_WINDOW_OPTIONS: Array<{
  value: TimeWindow;
  label: string;
  description: string;
}> = [
  { value: '24H', label: 'Last 24h', description: 'Recent service pulse' },
  { value: '7D', label: 'Last 7 days', description: 'Weekly trading view' },
  { value: '30D', label: 'Last 30 days', description: 'Monthly trend view' },
  { value: 'ALL', label: 'All time', description: 'Everything on record' },
];

const LIVE_ORDER_STATUSES = new Set<OwnerOrderStatus>([
  'PAID',
  'SENT_TO_KITCHEN',
  'PREPARING',
  'READY',
  'SERVED',
]);

const REPORT_STATUS_ORDER: OwnerOrderStatus[] = [
  'PENDING_PAYMENT',
  'PAYMENT_PROCESSING',
  'PAID',
  'SENT_TO_KITCHEN',
  'PREPARING',
  'READY',
  'SERVED',
  'COMPLETED',
  'CANCELLED',
];

export function OutletReportsPage() {
  const {
    outletId,
    session,
    loading,
    outlet,
    error: outletError,
    busy: outletBusy,
  } = useOutletContext();
  const [orders, setOrders] = useState<OwnerOrderListEntry[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [windowFilter, setWindowFilter] = useState<TimeWindow>('7D');
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

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
        const response = await getOrders(authToken, outletId);
        if (!cancelled) {
          setOrders(response);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Failed to load outlet reports.',
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

  const filteredOrders = useMemo(() => {
    const cutoff = getCutoffTimestamp(windowFilter);
    const next = cutoff
      ? orders.filter((order) => new Date(order.createdAt).getTime() >= cutoff)
      : orders;
    return [...next].sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    );
  }, [orders, windowFilter]);

  const previousWindowOrders = useMemo(() => {
    const range = getWindowRange(windowFilter);
    if (!range) {
      return [];
    }
    return orders.filter((order) => {
      const timestamp = new Date(order.createdAt).getTime();
      return timestamp >= range.previousStart && timestamp < range.currentStart;
    });
  }, [orders, windowFilter]);

  const metrics = useMemo(() => {
    const paidOrders = filteredOrders.filter(
      (order) => order.paymentStatus === 'PAID',
    );
    const grossSalesCents = paidOrders.reduce(
      (sum, order) => sum + order.grandTotalCents,
      0,
    );
    const unpaidExposureCents = filteredOrders
      .filter(
        (order) =>
          order.paymentStatus !== 'PAID' && order.status !== 'CANCELLED',
      )
      .reduce((sum, order) => sum + order.grandTotalCents, 0);
    const liveOrders = filteredOrders.filter((order) =>
      LIVE_ORDER_STATUSES.has(order.status),
    ).length;
    const completedOrders = filteredOrders.filter(
      (order) => order.status === 'COMPLETED',
    ).length;

    return {
      orderCount: filteredOrders.length,
      paidOrderCount: paidOrders.length,
      grossSalesCents,
      unpaidExposureCents,
      liveOrders,
      completedOrders,
      averagePaidOrderCents:
        paidOrders.length > 0
          ? Math.round(grossSalesCents / paidOrders.length)
          : 0,
    };
  }, [filteredOrders]);

  const previousMetrics = useMemo(() => {
    const paidOrders = previousWindowOrders.filter(
      (order) => order.paymentStatus === 'PAID',
    );
    const grossSalesCents = paidOrders.reduce(
      (sum, order) => sum + order.grandTotalCents,
      0,
    );
    return {
      orderCount: previousWindowOrders.length,
      grossSalesCents,
      paidOrderCount: paidOrders.length,
    };
  }, [previousWindowOrders]);

  const statusBreakdown = useMemo(
    () =>
      REPORT_STATUS_ORDER.map((status) => ({
        status,
        count: filteredOrders.filter((order) => order.status === status).length,
      })).filter((entry) => entry.count > 0),
    [filteredOrders],
  );

  const paymentMethodBreakdown = useMemo(() => {
    const totals = new Map<string, { count: number; amountCents: number }>();
    for (const order of filteredOrders) {
      const methods = order.payments.length
        ? order.payments
        : [{ method: 'UNRECORDED', status: order.paymentStatus }];
      for (const payment of methods) {
        const current = totals.get(payment.method) ?? {
          count: 0,
          amountCents: 0,
        };
        totals.set(payment.method, {
          count: current.count + 1,
          amountCents:
            current.amountCents +
            (payment.status === 'PAID' ? order.grandTotalCents : 0),
        });
      }
    }
    return [...totals.entries()]
      .map(([method, data]) => ({ method, ...data }))
      .sort((left, right) => right.count - left.count);
  }, [filteredOrders]);

  const topTables = useMemo(() => {
    const totals = new Map<string, { label: string; count: number }>();
    for (const order of filteredOrders) {
      const label = order.table?.displayName ?? 'Walk-in / no table';
      const key = order.table?.tableCode ?? 'NO_TABLE';
      const current = totals.get(key) ?? { label, count: 0 };
      totals.set(key, { label, count: current.count + 1 });
    }
    return [...totals.values()]
      .sort((left, right) => right.count - left.count)
      .slice(0, 5);
  }, [filteredOrders]);

  const trendPoints = useMemo(
    () => buildTrendPoints(filteredOrders, windowFilter),
    [filteredOrders, windowFilter],
  );

  const exportSummary = useMemo(() => {
    const periodLabel =
      TIME_WINDOW_OPTIONS.find((option) => option.value === windowFilter)?.label ??
      windowFilter;
    const topPaymentMethod = paymentMethodBreakdown[0];
    const topTable = topTables[0];
    return [
      `Outlet report summary`,
      `Outlet: ${outlet?.name ?? 'Unknown outlet'}`,
      `Window: ${periodLabel}`,
      `Orders: ${metrics.orderCount}`,
      `Paid orders: ${metrics.paidOrderCount}`,
      `Gross paid sales: ${formatCurrency(outlet?.currency ?? 'SGD', metrics.grossSalesCents)}`,
      `Average paid order: ${formatCurrency(outlet?.currency ?? 'SGD', metrics.averagePaidOrderCents)}`,
      `Unpaid exposure: ${formatCurrency(outlet?.currency ?? 'SGD', metrics.unpaidExposureCents)}`,
      `Live orders: ${metrics.liveOrders}`,
      `Completed orders: ${metrics.completedOrders}`,
      `Previous-window sales delta: ${formatSignedCurrency(
        outlet?.currency ?? 'SGD',
        metrics.grossSalesCents - previousMetrics.grossSalesCents,
      )}`,
      `Top payment method: ${
        topPaymentMethod
          ? `${formatEnum(topPaymentMethod.method)} (${topPaymentMethod.count})`
          : 'No payment activity'
      }`,
      `Top table: ${
        topTable ? `${topTable.label} (${topTable.count})` : 'No table activity'
      }`,
    ].join('\n');
  }, [
    metrics,
    outlet,
    paymentMethodBreakdown,
    previousMetrics.grossSalesCents,
    topTables,
    windowFilter,
  ]);

  async function handleCopySummary() {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      setCopySuccess('Copy is not available in this browser.');
      return;
    }
    try {
      await navigator.clipboard.writeText(exportSummary);
      setCopySuccess('Summary copied to clipboard.');
    } catch {
      setCopySuccess('Copy failed. You can still select and copy manually.');
    }
  }

  return (
    <OutletPageLayout
      title="Outlet reports"
      subtitle="Read current trading health from live order data while deeper reporting endpoints are still being shaped."
    >
      {outlet ? <OutletHeader outlet={outlet} /> : null}

      {loading || outletBusy || busy ? (
        <section className="section-panel">
          <p className="eyebrow">Hydrating reports</p>
          <h2 className="serif">Loading outlet order data...</h2>
          <p>
            This reporting view aggregates from the existing admin order list
            API, so no separate analytics pipeline is required yet.
          </p>
        </section>
      ) : null}

      {outletError ? (
        <section className="section-panel">
          <div className="alert error">{outletError}</div>
        </section>
      ) : null}

      {error ? (
        <section className="section-panel">
          <div className="alert error">{error}</div>
        </section>
      ) : null}

      {!loading && !outletBusy && !busy && !outletError && !error ? (
        <>
          <section className="section-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Time window</p>
                <h2 className="serif">Filter the reporting window</h2>
                <p>
                  Switch between current pulse and longer historical views
                  without leaving the outlet workspace.
                </p>
              </div>
            </div>

            <div className="filter-chip-row">
              {TIME_WINDOW_OPTIONS.map((option) => (
                <button
                  className={
                    windowFilter === option.value
                      ? 'filter-chip active'
                      : 'filter-chip'
                  }
                  key={option.value}
                  onClick={() => setWindowFilter(option.value)}
                  type="button"
                >
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="section-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Trading snapshot</p>
                <h2 className="serif">Current outlet metrics</h2>
              </div>
            </div>

            <div className="dashboard-stats">
              <article className="dashboard-card">
                <span className="metric-label">Orders</span>
                <span className="metric-value">{metrics.orderCount}</span>
                <p className="metric-note">
                  Total orders in the selected reporting window
                </p>
              </article>
              <article className="dashboard-card">
                <span className="metric-label">Gross paid sales</span>
                <span className="metric-value">
                  {formatCurrency(outlet?.currency ?? 'SGD', metrics.grossSalesCents)}
                </span>
                <p className="metric-note">Paid orders only</p>
              </article>
              <article className="dashboard-card">
                <span className="metric-label">Average paid order</span>
                <span className="metric-value">
                  {formatCurrency(
                    outlet?.currency ?? 'SGD',
                    metrics.averagePaidOrderCents,
                  )}
                </span>
                <p className="metric-note">Average ticket size for paid orders</p>
              </article>
              <article className="dashboard-card">
                <span className="metric-label">Unpaid exposure</span>
                <span className="metric-value">
                  {formatCurrency(
                    outlet?.currency ?? 'SGD',
                    metrics.unpaidExposureCents,
                  )}
                </span>
                <p className="metric-note">
                  Orders not yet fully paid and not cancelled
                </p>
              </article>
            </div>

            <div className="detail-grid">
              <article className="info-card">
                <span className="metric-label">Live orders</span>
                <span className="metric-value">{metrics.liveOrders}</span>
                <p className="metric-note">
                  Paid, in kitchen flow, ready, or served
                </p>
              </article>
              <article className="info-card">
                <span className="metric-label">Paid orders</span>
                <span className="metric-value">{metrics.paidOrderCount}</span>
                <p className="metric-note">Orders with confirmed payment</p>
              </article>
              <article className="info-card">
                <span className="metric-label">Completed</span>
                <span className="metric-value">{metrics.completedOrders}</span>
                <p className="metric-note">Orders closed out by service staff</p>
              </article>
              <article className="info-card">
                <span className="metric-label">Previous-period orders</span>
                <span className="metric-value">
                  {windowFilter === 'ALL'
                    ? 'N/A'
                    : formatSignedNumber(
                        metrics.orderCount - previousMetrics.orderCount,
                      )}
                </span>
                <p className="metric-note">
                  {windowFilter === 'ALL'
                    ? 'Comparison is only shown for fixed time windows.'
                    : `Delta versus the prior ${TIME_WINDOW_OPTIONS.find((option) => option.value === windowFilter)?.label.toLowerCase()}.`}
                </p>
              </article>
              <article className="info-card">
                <span className="metric-label">Previous-period sales</span>
                <span className="metric-value">
                  {windowFilter === 'ALL'
                    ? 'N/A'
                    : formatSignedCurrency(
                        outlet?.currency ?? 'SGD',
                        metrics.grossSalesCents - previousMetrics.grossSalesCents,
                      )}
                </span>
                <p className="metric-note">
                  {windowFilter === 'ALL'
                    ? 'Comparison is only shown for fixed time windows.'
                    : 'Gross paid sales change from the previous matching period.'}
                </p>
              </article>
            </div>
          </section>

          <section className="section-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Trend view</p>
                <h2 className="serif">Order and sales trend</h2>
                <p>
                  This uses the current order list to build a lightweight trend
                  view until dedicated analytics endpoints are introduced.
                </p>
              </div>
            </div>

            <div className="trend-grid">
              {trendPoints.length === 0 ? (
                <div className="empty-state">
                  <strong>No trend data yet.</strong>
                  <p>
                    Generate more orders in this window to see the time-based
                    trend breakdown.
                  </p>
                </div>
              ) : (
                trendPoints.map((point) => (
                  <article className="trend-card" key={point.label}>
                    <div className="section-header">
                      <strong>{point.label}</strong>
                      <span className="badge">{point.orderCount} orders</span>
                    </div>
                    <div className="trend-bar-shell">
                      <div
                        className="trend-bar"
                        style={{ width: `${point.barWidthPercent}%` }}
                      />
                    </div>
                    <div className="split-line">
                      <span className="muted">Paid sales</span>
                      <strong>
                        {formatCurrency(
                          outlet?.currency ?? 'SGD',
                          point.grossSalesCents,
                        )}
                      </strong>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="section-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Breakdowns</p>
                <h2 className="serif">Status, payment mix, and table activity</h2>
              </div>
            </div>

            <div className="section-header">
              <div>
                <p className="eyebrow">Owner export</p>
                <h2 className="serif">Export-ready summary</h2>
                <p>
                  Copy this block into a handover note, ops update, or client
                  summary while deeper export tooling is still pending.
                </p>
              </div>
              <button
                className="secondary-button"
                onClick={() => void handleCopySummary()}
                type="button"
              >
                Copy summary
              </button>
            </div>

            {copySuccess ? (
              <div className="alert success">{copySuccess}</div>
            ) : null}

            <div className="field">
              <label htmlFor="owner-export-summary">Summary text</label>
              <textarea
                id="owner-export-summary"
                readOnly
                rows={12}
                value={exportSummary}
              />
            </div>
          </section>

          <section className="section-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Breakdowns</p>
                <h2 className="serif">Status, payment mix, and table activity</h2>
              </div>
            </div>

            <div className="outlet-grid">
              <article className="list-item">
                <h3>Status distribution</h3>
                <div className="list-block">
                  {statusBreakdown.length === 0 ? (
                    <p className="muted">No orders in this window.</p>
                  ) : (
                    statusBreakdown.map((entry) => (
                      <div className="split-line" key={entry.status}>
                        <span>{formatEnum(entry.status)}</span>
                        <strong>{entry.count}</strong>
                      </div>
                    ))
                  )}
                </div>
              </article>

              <article className="list-item">
                <h3>Payment method mix</h3>
                <div className="list-block">
                  {paymentMethodBreakdown.length === 0 ? (
                    <p className="muted">No payment activity yet.</p>
                  ) : (
                    paymentMethodBreakdown.map((entry) => (
                      <div className="split-line" key={entry.method}>
                        <span>{formatEnum(entry.method)}</span>
                        <strong>
                          {entry.count} |{' '}
                          {formatCurrency(
                            outlet?.currency ?? 'SGD',
                            entry.amountCents,
                          )}
                        </strong>
                      </div>
                    ))
                  )}
                </div>
              </article>

              <article className="list-item">
                <h3>Top tables</h3>
                <div className="list-block">
                  {topTables.length === 0 ? (
                    <p className="muted">No orders yet.</p>
                  ) : (
                    topTables.map((entry) => (
                      <div className="split-line" key={entry.label}>
                        <span>{entry.label}</span>
                        <strong>{entry.count}</strong>
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
                <p className="eyebrow">Recent orders</p>
                <h2 className="serif">Most recent tickets in scope</h2>
              </div>
            </div>

            {filteredOrders.length === 0 ? (
              <div className="empty-state">
                <strong>No orders found.</strong>
                <p>
                  Try a larger reporting window or generate new activity from
                  the customer or staff ordering flows.
                </p>
              </div>
            ) : (
              <div className="list-block">
                {filteredOrders.slice(0, 8).map((order) => (
                  <article className="list-item" key={order.id}>
                    <div className="section-header">
                      <div>
                        <h3>#{order.orderNumber}</h3>
                        <p>
                          {order.customerName || order.table?.displayName || 'Guest order'}
                        </p>
                      </div>
                      <div className="badge-row">
                        <span className="badge">{formatEnum(order.status)}</span>
                        <span
                          className={
                            order.paymentStatus === 'PAID'
                              ? 'badge success'
                              : 'badge warn'
                          }
                        >
                          {formatEnum(order.paymentStatus)}
                        </span>
                      </div>
                    </div>
                    <div className="detail-grid">
                      <article className="info-card">
                        <span className="metric-label">Created</span>
                        <span className="scope-card-value">
                          {formatDateTime(order.createdAt)}
                        </span>
                      </article>
                      <article className="info-card">
                        <span className="metric-label">Total</span>
                        <span className="scope-card-value">
                          {formatCurrency(order.currency, order.grandTotalCents)}
                        </span>
                      </article>
                      <article className="info-card">
                        <span className="metric-label">Payment methods</span>
                        <span className="scope-card-value">
                          {order.payments.length
                            ? order.payments
                                .map((payment) => formatEnum(payment.method))
                                .join(', ')
                            : 'Not recorded'}
                        </span>
                      </article>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </OutletPageLayout>
  );
}

function getCutoffTimestamp(windowFilter: TimeWindow) {
  const now = Date.now();
  switch (windowFilter) {
    case '24H':
      return now - 24 * 60 * 60 * 1000;
    case '7D':
      return now - 7 * 24 * 60 * 60 * 1000;
    case '30D':
      return now - 30 * 24 * 60 * 60 * 1000;
    case 'ALL':
    default:
      return null;
  }
}

function getWindowRange(windowFilter: TimeWindow) {
  const now = Date.now();
  switch (windowFilter) {
    case '24H':
      return {
        currentStart: now - 24 * 60 * 60 * 1000,
        previousStart: now - 48 * 60 * 60 * 1000,
      };
    case '7D':
      return {
        currentStart: now - 7 * 24 * 60 * 60 * 1000,
        previousStart: now - 14 * 24 * 60 * 60 * 1000,
      };
    case '30D':
      return {
        currentStart: now - 30 * 24 * 60 * 60 * 1000,
        previousStart: now - 60 * 24 * 60 * 60 * 1000,
      };
    case 'ALL':
    default:
      return null;
  }
}

function buildTrendPoints(
  orders: OwnerOrderListEntry[],
  windowFilter: TimeWindow,
) {
  const grouped = new Map<string, { orderCount: number; grossSalesCents: number }>();
  for (const order of orders) {
    const createdAt = new Date(order.createdAt);
    const label =
      windowFilter === '24H'
        ? new Intl.DateTimeFormat('en-SG', {
            hour: 'numeric',
            hour12: false,
          }).format(createdAt)
        : new Intl.DateTimeFormat('en-SG', {
            day: '2-digit',
            month: 'short',
          }).format(createdAt);
    const current = grouped.get(label) ?? { orderCount: 0, grossSalesCents: 0 };
    grouped.set(label, {
      orderCount: current.orderCount + 1,
      grossSalesCents:
        current.grossSalesCents +
        (order.paymentStatus === 'PAID' ? order.grandTotalCents : 0),
    });
  }
  const maxOrders = Math.max(
    1,
    ...[...grouped.values()].map((entry) => entry.orderCount),
  );
  return [...grouped.entries()]
    .map(([label, entry]) => ({
      label,
      ...entry,
      barWidthPercent: Math.max(12, Math.round((entry.orderCount / maxOrders) * 100)),
    }))
    .sort((left, right) => left.label.localeCompare(right.label))
    .slice(windowFilter === '24H' ? -24 : -10);
}

function formatCurrency(currency: string, cents: number) {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatSignedCurrency(currency: string, cents: number) {
  const amount = formatCurrency(currency, Math.abs(cents));
  return cents > 0 ? `+${amount}` : cents < 0 ? `-${amount}` : amount;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatSignedNumber(value: number) {
  if (value > 0) {
    return `+${value}`;
  }
  return `${value}`;
}

function formatEnum(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
