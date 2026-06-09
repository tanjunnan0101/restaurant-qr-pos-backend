'use client';

import {
  BellRing,
  ChefHat,
  CreditCard,
  Radio,
  ScanLine,
  SquareTerminal,
  Store,
  TimerReset,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { getOrders, getOutlets, getTables } from '@/lib/api';
import { createOperationsSocket, outletOperationsEvents } from '@/lib/realtime';
import type { OutletOperationsSummary, RealtimeStatus } from '@/lib/types';
import { StaffPageFrame } from './staff-page-frame';
import { useStaffSession } from './staff-session-guard';

const liveQueueStatuses = new Set([
  'SENT_TO_KITCHEN',
  'PREPARING',
  'READY',
  'SERVED',
]);

const readyToRunStatuses = new Set(['SENT_TO_KITCHEN', 'PREPARING', 'READY']);
const settledStatuses = new Set(['COMPLETED']);
const dashboardRealtimeEvents = [
  ...outletOperationsEvents,
  'table.status.changed',
] as const;

export function DashboardPage() {
  const { session, loading } = useStaffSession();
  const [outlets, setOutlets] = useState<OutletOperationsSummary[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('idle');
  const [refreshTick, setRefreshTick] = useState(0);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const queueRefresh = useEffectEvent(() => {
    if (refreshTimerRef.current) {
      return;
    }
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      setRefreshTick((current) => current + 1);
    }, 250);
  });

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
        const outletList = await getOutlets(authToken);
        const summaries = await Promise.all(
          outletList.map(async (outlet) => {
            const [orders, tables] = await Promise.all([
              getOrders(authToken, outlet.id),
              getTables(authToken, outlet.id),
            ]);

            const tableCount = tables.reduce(
              (total, zone) => total + zone.tables.length,
              0,
            );
            const availableTables = tables.reduce(
              (total, zone) =>
                total +
                zone.tables.filter((table) => table.status === 'AVAILABLE')
                  .length,
              0,
            );
            const occupiedTables = tables.reduce(
              (total, zone) =>
                total +
                zone.tables.filter((table) => table.status === 'OCCUPIED')
                  .length,
              0,
            );
            const reservedTables = tables.reduce(
              (total, zone) =>
                total +
                zone.tables.filter((table) => table.status === 'RESERVED')
                  .length,
              0,
            );
            const outOfServiceTables = tables.reduce(
              (total, zone) =>
                total +
                zone.tables.filter((table) => table.status === 'OUT_OF_SERVICE')
                  .length,
              0,
            );
            const tablesWithoutQr = tables.reduce(
              (total, zone) =>
                total + zone.tables.filter((table) => table.qrCodes.length === 0).length,
              0,
            );
            const openServiceRequests = tables.reduce(
              (total, zone) =>
                total +
                zone.tables.reduce(
                  (tableTotal, table) => tableTotal + table.serviceRequests.length,
                  0,
                ),
              0,
            );
            const attentionScore =
              openServiceRequests * 5 +
              outOfServiceTables * 4 +
              tablesWithoutQr * 2 +
              reservedTables +
              occupiedTables +
              Math.max(0, 5 - availableTables);

            return {
              outlet,
              totalOrders: orders.length,
              liveQueue: orders.filter((order) =>
                liveQueueStatuses.has(order.status),
              ).length,
              readyToRun: orders.filter((order) =>
                readyToRunStatuses.has(order.status),
              ).length,
              settled: orders.filter((order) =>
                settledStatuses.has(order.status),
              ).length,
              tableCount,
              availableTables,
              occupiedTables,
              reservedTables,
              outOfServiceTables,
              tablesWithoutQr,
              openServiceRequests,
              attentionScore,
            } satisfies OutletOperationsSummary;
          }),
        );

        if (!cancelled) {
          setOutlets(
            summaries.sort((left, right) => {
              const scoreDelta = right.attentionScore - left.attentionScore;
              if (scoreDelta !== 0) {
                return scoreDelta;
              }
              return right.readyToRun - left.readyToRun;
            }),
          );
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
  }, [refreshTick, session]);

  useEffect(() => {
    if (!session?.accessToken) {
      setRealtimeStatus('idle');
      return;
    }

    const outletIds = session.user.outlets.map((outlet) => outlet.id);
    if (outletIds.length === 0) {
      setRealtimeStatus('idle');
      return;
    }

    setRealtimeStatus('connecting');
    const socket = createOperationsSocket(session.accessToken);

    const subscribeToOutlets = () => {
      let acknowledged = 0;
      let failed = false;

      for (const outletId of outletIds) {
        socket.emit(
          'subscribe.outlet',
          { outletId },
          (response?: { ok?: boolean; message?: string }) => {
            if (failed) {
              return;
            }
            if (!response?.ok) {
              failed = true;
              setRealtimeStatus('error');
              if (response?.message) {
                setError(response.message);
              }
              return;
            }

            acknowledged += 1;
            if (acknowledged === outletIds.length) {
              setRealtimeStatus('connected');
              setError(null);
              queueRefresh();
            }
          },
        );
      }
    };

    const handleConnect = () => {
      setRealtimeStatus('connecting');
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', () => {
      setRealtimeStatus('offline');
    });
    socket.on('connect_error', (connectError) => {
      setRealtimeStatus('error');
      setError(connectError.message || 'Realtime connection failed.');
    });
    socket.on('realtime.error', (payload?: { message?: string }) => {
      setRealtimeStatus('error');
      setError(payload?.message ?? 'Realtime connection failed.');
    });
    socket.on('operations.connected', subscribeToOutlets);

    for (const eventName of dashboardRealtimeEvents) {
      socket.on(eventName, () => {
        setError(null);
        queueRefresh();
      });
    }

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      socket.off('connect', handleConnect);
      socket.off('operations.connected', subscribeToOutlets);
      socket.disconnect();
    };
  }, [queueRefresh, session]);

  return (
    <StaffPageFrame
      title="Service board"
      subtitle="See what needs action now, then jump straight into POS, tables, kitchen, or payment recovery."
    >
      {loading || busy ? (
        <section className="panel section-panel">
          <p className="eyebrow">Hydrating</p>
          <h2 className="section-title">
            Loading outlet service data...
          </h2>
          <p className="supporting-copy">Pulling live outlet, order, and table data.</p>
        </section>
      ) : error ? (
        <section className="panel section-panel">
          <div className="alert error">{error}</div>
        </section>
      ) : (
        <>
          <section className="panel section-panel hero-panel hero-panel--staff">
            <div className="hero-panel__header">
              <div className="hero-panel__copy">
                <p className="eyebrow">Shift snapshot</p>
                <h2 className="section-title hero-panel__title">
                  The next action should be obvious in under three seconds.
                </h2>
                <p className="hero-panel__lede hero-panel__lede--dark">
                  Use this board as the live control surface for queue, guest
                  help, table pressure, and outlet handoff.
                </p>
                <div className="badge-row">
                  <span
                    className={`status-pill ${toneForRealtime(realtimeStatus)}`}
                  >
                    {formatRealtimeStatus(realtimeStatus)}
                  </span>
                  <span className="tag tag--dark">
                    {outlets.length} outlet{outlets.length === 1 ? '' : 's'} in
                    shift scope
                  </span>
                </div>
              </div>

              <div className="hero-panel__spotlight">
                <article className="spotlight-card spotlight-card--danger">
                  <span className="spotlight-card__icon">
                    <BellRing aria-hidden="true" size={18} />
                  </span>
                  <div>
                    <span className="metric-label">Guest attention</span>
                    <strong className="spotlight-card__value">
                      {outlets.reduce(
                        (sum, outlet) => sum + outlet.openServiceRequests,
                        0,
                      )}
                    </strong>
                    <p className="metric-note">Help requests waiting on floor staff.</p>
                  </div>
                </article>
                <article className="spotlight-card spotlight-card--success">
                  <span className="spotlight-card__icon">
                    <ChefHat aria-hidden="true" size={18} />
                  </span>
                  <div>
                    <span className="metric-label">Ready to run</span>
                    <strong className="spotlight-card__value">
                      {outlets.reduce((sum, outlet) => sum + outlet.readyToRun, 0)}
                    </strong>
                    <p className="metric-note">Orders closest to the next service move.</p>
                  </div>
                </article>
              </div>
            </div>
          </section>

          <section className="metric-board">
            <article className="panel metric-card metric-card--accent">
              <span className="metric-label">Outlets</span>
              <span className="metric-icon">
                <ScanLine aria-hidden="true" size={18} />
              </span>
              <strong className="metric-value">{outlets.length}</strong>
              <p className="supporting-copy">Accessible in this staff session.</p>
            </article>
            <article className="panel metric-card metric-card--accent">
              <span className="metric-label">Live queue</span>
              <span className="metric-icon">
                <Radio aria-hidden="true" size={18} />
              </span>
              <strong className="metric-value">
                {outlets.reduce((sum, outlet) => sum + outlet.liveQueue, 0)}
              </strong>
              <p className="supporting-copy">Orders already in active service flow.</p>
            </article>
            <article className="panel metric-card metric-card--warning">
              <span className="metric-label">Action now</span>
              <span className="metric-icon">
                <TimerReset aria-hidden="true" size={18} />
              </span>
              <strong className="metric-value">
                {outlets.reduce((sum, outlet) => sum + outlet.readyToRun, 0)}
              </strong>
              <p className="supporting-copy">Tickets closest to the next state change.</p>
            </article>
            <article className="panel metric-card metric-card--success">
              <span className="metric-label">Occupied tables</span>
              <strong className="metric-value">
                {outlets.reduce(
                  (sum, outlet) => sum + outlet.occupiedTables,
                  0,
                )}
              </strong>
              <p className="supporting-copy">Current floor pressure across your outlets.</p>
            </article>
            <article className="panel metric-card metric-card--danger">
              <span className="metric-label">Help requests</span>
              <strong className="metric-value">
                {outlets.reduce((sum, outlet) => sum + outlet.openServiceRequests, 0)}
              </strong>
              <p className="supporting-copy">Guests waiting for direct staff attention.</p>
            </article>
            <article className="panel metric-card metric-card--warning">
              <span className="metric-label">Floor issues</span>
              <strong className="metric-value">
                {outlets.reduce(
                  (sum, outlet) =>
                    sum + outlet.outOfServiceTables + outlet.tablesWithoutQr,
                  0,
                )}
              </strong>
              <p className="supporting-copy">Out-of-service tables and QR gaps.</p>
            </article>
            <article className="panel metric-card metric-card--neutral">
              <span className="metric-label">Live sync</span>
              <strong className="metric-value">
                {formatRealtimeStatus(realtimeStatus)}
              </strong>
              <p className="supporting-copy">Realtime outlet updates are streaming in.</p>
            </article>
          </section>

          <section className="panel section-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Action row</p>
                <h2 className="section-title">Open the task, not another report</h2>
                <p className="supporting-copy">These are the four fastest paths back into live service.</p>
              </div>
            </div>

            <div className="operations-grid">
              <Link className="sub-panel sub-panel--soft" href={outlets[0] ? `/outlets/${outlets[0].outlet.id}/pos` : '/dashboard'}>
                <div className="section-header">
                  <div>
                    <h3>Open POS</h3>
                    <p className="supporting-copy">Jump into the live cashier terminal.</p>
                  </div>
                  <SquareTerminal aria-hidden="true" size={18} />
                </div>
              </Link>
              <Link className="sub-panel sub-panel--soft" href={outlets[0] ? `/outlets/${outlets[0].outlet.id}/orders` : '/dashboard'}>
                <div className="section-header">
                  <div>
                    <h3>Recover payments</h3>
                    <p className="supporting-copy">Handle unpaid and blocked orders fast.</p>
                  </div>
                  <CreditCard aria-hidden="true" size={18} />
                </div>
              </Link>
              <Link className="sub-panel sub-panel--soft" href={outlets[0] ? `/outlets/${outlets[0].outlet.id}/tables` : '/dashboard'}>
                <div className="section-header">
                  <div>
                    <h3>View tables</h3>
                    <p className="supporting-copy">Resolve help calls and seating pressure.</p>
                  </div>
                  <Store aria-hidden="true" size={18} />
                </div>
              </Link>
              <Link className="sub-panel sub-panel--soft" href={outlets[0] ? `/outlets/${outlets[0].outlet.id}/kds` : '/dashboard'}>
                <div className="section-header">
                  <div>
                    <h3>Kitchen board</h3>
                    <p className="supporting-copy">Check prep load and ready tickets.</p>
                  </div>
                  <ChefHat aria-hidden="true" size={18} />
                </div>
              </Link>
            </div>
          </section>

          <section className="panel section-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Outlet boards</p>
                <h2 className="section-title">Where the shift needs attention</h2>
                <p className="supporting-copy">Start with the outlet carrying the highest attention score.</p>
              </div>
            </div>

            <div className="operations-grid">
              {outlets.map((entry) => (
                <article className="panel queue-card queue-card--upgraded" key={entry.outlet.id}>
                  <div className="section-header">
                    <div>
                      <h3>{entry.outlet.name}</h3>
                      <p className="supporting-copy">
                        {entry.outlet.slug} | {entry.outlet.currency} |{' '}
                        {entry.outlet.timezone}
                      </p>
                      <p className="supporting-copy">
                        {attentionSummary(entry)}
                      </p>
                    </div>
                    <span
                      className={`status-pill ${attentionTone(entry)}`}
                    >
                      {attentionLabel(entry)}
                    </span>
                  </div>

                  <div className="queue-metrics">
                    <div className="metric-inline">
                      <span>Live queue</span>
                      <strong>{entry.liveQueue}</strong>
                    </div>
                    <div className="metric-inline">
                      <span>Act now</span>
                      <strong>{entry.readyToRun}</strong>
                    </div>
                    <div className="metric-inline">
                      <span>Settled</span>
                      <strong>{entry.settled}</strong>
                    </div>
                    <div className="metric-inline">
                      <span>Tables</span>
                      <strong>
                        {entry.occupiedTables}/{entry.tableCount}
                      </strong>
                    </div>
                    <div className="metric-inline">
                      <span>Reserved</span>
                      <strong>{entry.reservedTables}</strong>
                    </div>
                    <div className="metric-inline">
                      <span>Help requests</span>
                      <strong>{entry.openServiceRequests}</strong>
                    </div>
                    <div className="metric-inline">
                      <span>Out of service</span>
                      <strong>{entry.outOfServiceTables}</strong>
                    </div>
                    <div className="metric-inline">
                      <span>QR gaps</span>
                      <strong>{entry.tablesWithoutQr}</strong>
                    </div>
                  </div>

                  <div className="inline-actions">
                    <Link
                      className="primary-button"
                      href={`/outlets/${entry.outlet.id}/orders`}
                    >
                      Open orders
                    </Link>
                    <Link
                      className="secondary-button"
                      href={`/outlets/${entry.outlet.id}/kds`}
                    >
                      Kitchen
                    </Link>
                    <Link
                      className="secondary-button"
                      href={`/outlets/${entry.outlet.id}/tables`}
                    >
                      Tables
                    </Link>
                    <Link
                      className="secondary-button"
                      href={`/outlets/${entry.outlet.id}/pos`}
                    >
                      POS
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </StaffPageFrame>
  );
}

function formatRealtimeStatus(status: RealtimeStatus) {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'connecting':
      return 'Connecting';
    case 'error':
      return 'Attention needed';
    case 'offline':
      return 'Disconnected';
    default:
      return 'Idle';
  }
}

function toneForRealtime(status: RealtimeStatus) {
  switch (status) {
    case 'connected':
      return 'success';
    case 'connecting':
      return 'warning';
    case 'error':
      return 'danger';
    case 'offline':
      return 'neutral';
    default:
      return 'neutral';
  }
}

function attentionLabel(summary: OutletOperationsSummary) {
  if (summary.openServiceRequests > 0) {
    return 'Guest waiting';
  }
  if (summary.outOfServiceTables > 0) {
    return 'Floor issue';
  }
  if (summary.tablesWithoutQr > 0) {
    return 'QR gap';
  }
  if (summary.readyToRun > 0 || summary.liveQueue > 0) {
    return 'Service active';
  }
  return summary.outlet.status;
}

function attentionTone(summary: OutletOperationsSummary) {
  if (summary.openServiceRequests > 0) {
    return 'danger';
  }
  if (summary.outOfServiceTables > 0) {
    return 'danger';
  }
  if (summary.tablesWithoutQr > 0 || summary.reservedTables > 0) {
    return 'warning';
  }
  if (summary.liveQueue > 0 || summary.occupiedTables > 0) {
    return 'success';
  }
  return 'neutral';
}

function attentionSummary(summary: OutletOperationsSummary) {
  const fragments = [
    summary.openServiceRequests
      ? `${summary.openServiceRequests} help request${summary.openServiceRequests === 1 ? '' : 's'}`
      : null,
    summary.liveQueue ? `${summary.liveQueue} live ticket${summary.liveQueue === 1 ? '' : 's'}` : null,
    summary.reservedTables
      ? `${summary.reservedTables} reserved table${summary.reservedTables === 1 ? '' : 's'}`
      : null,
    summary.outOfServiceTables
      ? `${summary.outOfServiceTables} out of service`
      : null,
    summary.tablesWithoutQr
      ? `${summary.tablesWithoutQr} without QR`
      : null,
  ].filter(Boolean);

  if (fragments.length === 0) {
    return `${summary.availableTables}/${summary.tableCount} tables currently free to seat.`;
  }

  return fragments.join(' | ');
}
