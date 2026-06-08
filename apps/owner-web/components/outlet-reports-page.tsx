'use client';

import { useEffect, useMemo, useState } from 'react';
import { getOrderDetail, getOrders } from '@/lib/api';
import type {
  OwnerOrderDetail,
  OwnerOrderListEntry,
  OwnerOrderStatus,
} from '@/lib/types';
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
  const [statusFilter, setStatusFilter] = useState<OwnerOrderStatus | 'ALL'>('ALL');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('ALL');
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>('ALL');
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [detailBusyOrderId, setDetailBusyOrderId] = useState<string | null>(null);
  const [orderDetails, setOrderDetails] = useState<Record<string, OwnerOrderDetail>>(
    {},
  );

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

  const scopedOrders = useMemo(() => {
    const cutoff = getCutoffTimestamp(windowFilter);
    const next = cutoff
      ? orders.filter((order) => new Date(order.createdAt).getTime() >= cutoff)
      : orders;
    return [...next].sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    );
  }, [orders, windowFilter]);

  const paymentMethodOptions = useMemo(() => {
    const methods = new Set<string>();
    for (const order of scopedOrders) {
      if (order.payments.length === 0) {
        methods.add('UNRECORDED');
      }
      for (const payment of order.payments) {
        methods.add(payment.method);
      }
    }
    return ['ALL', ...[...methods].sort()];
  }, [scopedOrders]);

  const sourceOptions = useMemo(
    () => ['ALL', ...new Set(scopedOrders.map((order) => order.source))].flat(),
    [scopedOrders],
  );

  const serviceTypeOptions = useMemo(
    () => ['ALL', ...new Set(scopedOrders.map((order) => order.serviceType))].flat(),
    [scopedOrders],
  );

  const filteredOrders = useMemo(() => {
    return scopedOrders.filter((order) => {
      if (statusFilter !== 'ALL' && order.status !== statusFilter) {
        return false;
      }
      if (paymentMethodFilter !== 'ALL') {
        const methods = order.payments.length
          ? order.payments.map((payment) => payment.method)
          : ['UNRECORDED'];
        if (!methods.includes(paymentMethodFilter)) {
          return false;
        }
      }
      if (sourceFilter !== 'ALL' && order.source !== sourceFilter) {
        return false;
      }
      if (serviceTypeFilter !== 'ALL' && order.serviceType !== serviceTypeFilter) {
        return false;
      }
      return true;
    });
  }, [
    paymentMethodFilter,
    scopedOrders,
    serviceTypeFilter,
    sourceFilter,
    statusFilter,
  ]);

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

  const sourceBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    for (const order of filteredOrders) {
      totals.set(order.source, (totals.get(order.source) ?? 0) + 1);
    }
    return [...totals.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((left, right) => right.count - left.count);
  }, [filteredOrders]);

  const serviceTypeBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    for (const order of filteredOrders) {
      totals.set(order.serviceType, (totals.get(order.serviceType) ?? 0) + 1);
    }
    return [...totals.entries()]
      .map(([serviceType, count]) => ({ serviceType, count }))
      .sort((left, right) => right.count - left.count);
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
      `Status filter: ${statusFilter === 'ALL' ? 'All statuses' : formatEnum(statusFilter)}`,
      `Payment filter: ${
        paymentMethodFilter === 'ALL'
          ? 'All payment methods'
          : formatEnum(paymentMethodFilter)
      }`,
      `Source filter: ${
        sourceFilter === 'ALL' ? 'All sources' : formatEnum(sourceFilter)
      }`,
      `Service filter: ${
        serviceTypeFilter === 'ALL'
          ? 'All service types'
          : formatEnum(serviceTypeFilter)
      }`,
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
    paymentMethodFilter,
    serviceTypeFilter,
    sourceFilter,
    statusFilter,
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

  function handleDownloadCsv() {
    if (typeof window === 'undefined') {
      setDownloadSuccess('CSV download is not available in this browser.');
      return;
    }

    const csv = buildOrdersCsv(filteredOrders);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const outletSlug = (outlet?.name ?? 'outlet')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    anchor.href = url;
    anchor.download = `${outletSlug || 'outlet'}-orders-${windowFilter.toLowerCase()}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);
    setDownloadSuccess('CSV export downloaded.');
  }

  async function handleToggleOrderDetail(order: OwnerOrderListEntry) {
    if (expandedOrderId === order.id) {
      setExpandedOrderId(null);
      return;
    }
    setExpandedOrderId(order.id);
    if (orderDetails[order.id] || !session?.accessToken) {
      return;
    }

    setDetailBusyOrderId(order.id);
    try {
      const detail = await getOrderDetail(session.accessToken, outletId, order.id);
      setOrderDetails((current) => ({
        ...current,
        [order.id]: detail,
      }));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load order detail.',
      );
    } finally {
      setDetailBusyOrderId(null);
    }
  }

  function resetFilters() {
    setWindowFilter('7D');
    setStatusFilter('ALL');
    setPaymentMethodFilter('ALL');
    setSourceFilter('ALL');
    setServiceTypeFilter('ALL');
    setCopySuccess(null);
    setDownloadSuccess(null);
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
              <button
                className="secondary-button"
                onClick={() => resetFilters()}
                type="button"
              >
                Reset filters
              </button>
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

            <div className="detail-grid">
              <div className="field">
                <label htmlFor="report-status-filter">Order status</label>
                <select
                  id="report-status-filter"
                  onChange={(event) =>
                    setStatusFilter(event.target.value as OwnerOrderStatus | 'ALL')
                  }
                  value={statusFilter}
                >
                  <option value="ALL">All statuses</option>
                  {REPORT_STATUS_ORDER.map((status) => (
                    <option key={status} value={status}>
                      {formatEnum(status)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="report-payment-filter">Payment method</label>
                <select
                  id="report-payment-filter"
                  onChange={(event) => setPaymentMethodFilter(event.target.value)}
                  value={paymentMethodFilter}
                >
                  {paymentMethodOptions.map((method) => (
                    <option key={method} value={method}>
                      {method === 'ALL' ? 'All payment methods' : formatEnum(method)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="report-source-filter">Order source</label>
                <select
                  id="report-source-filter"
                  onChange={(event) => setSourceFilter(event.target.value)}
                  value={sourceFilter}
                >
                  {sourceOptions.map((source) => (
                    <option key={source} value={source}>
                      {source === 'ALL' ? 'All sources' : formatEnum(source)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="report-service-type-filter">Service type</label>
                <select
                  id="report-service-type-filter"
                  onChange={(event) => setServiceTypeFilter(event.target.value)}
                  value={serviceTypeFilter}
                >
                  {serviceTypeOptions.map((serviceType) => (
                    <option key={serviceType} value={serviceType}>
                      {serviceType === 'ALL'
                        ? 'All service types'
                        : formatEnum(serviceType)}
                    </option>
                  ))}
                </select>
              </div>
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
                <p className="eyebrow">Owner export</p>
                <h2 className="serif">Export-ready summary</h2>
                <p>
                  Copy the summary or download filtered order rows for handover
                  notes, ops updates, and owner exports.
                </p>
              </div>
              <div className="action-row">
                <button
                  className="secondary-button"
                  onClick={() => handleDownloadCsv()}
                  type="button"
                >
                  Download CSV
                </button>
                <button
                  className="secondary-button"
                  onClick={() => void handleCopySummary()}
                  type="button"
                >
                  Copy summary
                </button>
              </div>
            </div>

            {copySuccess ? (
              <div className="alert success">{copySuccess}</div>
            ) : null}
            {downloadSuccess ? (
              <div className="alert success">{downloadSuccess}</div>
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

              <article className="list-item">
                <h3>Order sources</h3>
                <div className="list-block">
                  {sourceBreakdown.length === 0 ? (
                    <p className="muted">No source data yet.</p>
                  ) : (
                    sourceBreakdown.map((entry) => (
                      <div className="split-line" key={entry.source}>
                        <span>{formatEnum(entry.source)}</span>
                        <strong>{entry.count}</strong>
                      </div>
                    ))
                  )}
                </div>
              </article>

              <article className="list-item">
                <h3>Service types</h3>
                <div className="list-block">
                  {serviceTypeBreakdown.length === 0 ? (
                    <p className="muted">No service type data yet.</p>
                  ) : (
                    serviceTypeBreakdown.map((entry) => (
                      <div className="split-line" key={entry.serviceType}>
                        <span>{formatEnum(entry.serviceType)}</span>
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
                          {order.customerName || order.table?.displayName || 'Guest order'} |{' '}
                          {formatEnum(order.source)} | {formatEnum(order.serviceType)}
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
                    <div className="action-row">
                      <button
                        className="secondary-button"
                        onClick={() => void handleToggleOrderDetail(order)}
                        type="button"
                      >
                        {expandedOrderId === order.id ? 'Hide details' : 'View details'}
                      </button>
                    </div>
                    {expandedOrderId === order.id ? (
                      detailBusyOrderId === order.id ? (
                        <div className="info-card">
                          <p>Loading order detail...</p>
                        </div>
                      ) : orderDetails[order.id] ? (
                        <OrderDetailPanel detail={orderDetails[order.id]} />
                      ) : null
                    ) : null}
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

function buildOrdersCsv(orders: OwnerOrderListEntry[]) {
  const rows = [
    [
      'Order Number',
      'Source',
      'Service Type',
      'Status',
      'Payment Status',
      'Created At',
      'Updated At',
      'Customer',
      'Phone',
      'Table Code',
      'Table Name',
      'Payment Methods',
      'Payment States',
      'Kitchen Ticket States',
      'Grand Total',
    ],
    ...orders.map((order) => [
      order.orderNumber,
      formatEnum(order.source),
      formatEnum(order.serviceType),
      formatEnum(order.status),
      formatEnum(order.paymentStatus),
      order.createdAt,
      order.updatedAt,
      order.customerName ?? '',
      order.customerPhone ?? '',
      order.table?.tableCode ?? '',
      order.table?.displayName ?? '',
      order.payments.map((payment) => formatEnum(payment.method)).join(', '),
      order.payments.map((payment) => formatEnum(payment.status)).join(', '),
      order.kitchenTickets.map((ticket) => formatEnum(ticket.status)).join(', '),
      centsToDecimal(order.grandTotalCents),
    ]),
  ];

  return rows
    .map((row) => row.map((value) => escapeCsvCell(value)).join(','))
    .join('\n');
}

function escapeCsvCell(value: string) {
  const normalized = value.replace(/"/g, '""');
  if (/[",\n]/.test(normalized)) {
    return `"${normalized}"`;
  }
  return normalized;
}

function centsToDecimal(value: number) {
  return (value / 100).toFixed(2);
}

function OrderDetailPanel({ detail }: { detail: OwnerOrderDetail }) {
  return (
    <div className="list-block">
      <div className="detail-grid">
        <article className="info-card">
          <span className="metric-label">Source</span>
          <span className="scope-card-value">
            {formatEnum(detail.source)} | {formatEnum(detail.serviceType)}
          </span>
        </article>
        <article className="info-card">
          <span className="metric-label">Table</span>
          <span className="scope-card-value">
            {detail.table
              ? `${detail.table.displayName} (${detail.table.zone?.name ?? 'No zone'})`
              : 'No table'}
          </span>
        </article>
        <article className="info-card">
          <span className="metric-label">Timeline</span>
          <span className="scope-card-value">
            {detail.paidAt ? `Paid ${formatDateTime(detail.paidAt)}` : 'Not paid yet'}
          </span>
          <p className="metric-note">
            Updated {formatDateTime(detail.updatedAt)}
          </p>
        </article>
      </div>

      <article className="list-item">
        <h4>Items</h4>
        <div className="list-block">
          {detail.items.map((item) => (
            <div className="split-line" key={item.id}>
              <span>
                {item.quantity}x {item.itemName}
                {item.variantName ? ` | ${item.variantName}` : ''}
                {item.modifiers.length
                  ? ` | ${item.modifiers
                      .map((modifier) => modifier.modifierOptionName)
                      .join(', ')}`
                  : ''}
              </span>
              <strong>{formatCurrency(detail.currency, item.lineTotalCents)}</strong>
            </div>
          ))}
        </div>
      </article>

      <div className="outlet-grid">
        <article className="list-item">
          <h4>Payments</h4>
          <div className="list-block">
            {detail.payments.length === 0 ? (
              <p className="muted">No payment records.</p>
            ) : (
              detail.payments.map((payment) => (
                <div className="split-line" key={payment.id}>
                  <span>
                    {formatEnum(payment.method)} | {formatEnum(payment.status)}
                  </span>
                  <strong>
                    {formatCurrency(payment.currency, payment.amountCents)}
                  </strong>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="list-item">
          <h4>Kitchen tickets</h4>
          <div className="list-block">
            {detail.kitchenTickets.length === 0 ? (
              <p className="muted">No kitchen tickets.</p>
            ) : (
              detail.kitchenTickets.map((ticket) => (
                <div className="split-line" key={ticket.id}>
                  <span>{ticket.station.name}</span>
                  <strong>{formatEnum(ticket.status)}</strong>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="list-item">
          <h4>Print jobs</h4>
          <div className="list-block">
            {detail.printJobs.length === 0 ? (
              <p className="muted">No print jobs.</p>
            ) : (
              detail.printJobs.map((job) => (
                <div className="split-line" key={job.id}>
                  <span>
                    {formatEnum(job.template)} | {job.printer?.name ?? 'Unassigned'}
                  </span>
                  <strong>{formatEnum(job.status)}</strong>
                </div>
              ))
            )}
          </div>
        </article>
      </div>

      <div className="detail-grid">
        <article className="info-card">
          <span className="metric-label">Subtotal</span>
          <span className="scope-card-value">
            {formatCurrency(detail.currency, detail.subtotalCents)}
          </span>
        </article>
        <article className="info-card">
          <span className="metric-label">Service charge</span>
          <span className="scope-card-value">
            {formatCurrency(detail.currency, detail.serviceChargeTotalCents)}
          </span>
        </article>
        <article className="info-card">
          <span className="metric-label">GST</span>
          <span className="scope-card-value">
            {formatCurrency(detail.currency, detail.gstTotalCents)}
          </span>
        </article>
        <article className="info-card">
          <span className="metric-label">Total</span>
          <span className="scope-card-value">
            {formatCurrency(detail.currency, detail.grandTotalCents)}
          </span>
        </article>
      </div>
    </div>
  );
}
