'use client';

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
      title="Operations dashboard"
      subtitle="Live outlet snapshot for front-of-house and pass coordination."
    >
      {loading || busy ? (
        <section className="panel section-panel">
          <p className="eyebrow">Hydrating</p>
          <h2 className="section-title serif">
            Loading outlet service data...
          </h2>
          <p className="supporting-copy">
            The staff dashboard is pulling live outlet, order, and table data
            from the current backend APIs.
          </p>
        </section>
      ) : error ? (
        <section className="panel section-panel">
          <div className="alert error">{error}</div>
        </section>
      ) : (
        <>
          <section className="metric-board">
            <article className="panel metric-card">
              <span className="metric-label">Outlets</span>
              <strong className="metric-value">{outlets.length}</strong>
              <p className="supporting-copy">
                Accessible in this staff session.
              </p>
            </article>
            <article className="panel metric-card">
              <span className="metric-label">Live queue</span>
              <strong className="metric-value">
                {outlets.reduce((sum, outlet) => sum + outlet.liveQueue, 0)}
              </strong>
              <p className="supporting-copy">
                Orders in kitchen, ready, or currently being served.
              </p>
            </article>
            <article className="panel metric-card">
              <span className="metric-label">Action now</span>
              <strong className="metric-value">
                {outlets.reduce((sum, outlet) => sum + outlet.readyToRun, 0)}
              </strong>
              <p className="supporting-copy">
                Orders closest to the next staff status change.
              </p>
            </article>
            <article className="panel metric-card">
              <span className="metric-label">Occupied tables</span>
              <strong className="metric-value">
                {outlets.reduce(
                  (sum, outlet) => sum + outlet.occupiedTables,
                  0,
                )}
              </strong>
              <p className="supporting-copy">
                Current table pressure across your accessible outlets.
              </p>
            </article>
            <article className="panel metric-card">
              <span className="metric-label">Help requests</span>
              <strong className="metric-value">
                {outlets.reduce((sum, outlet) => sum + outlet.openServiceRequests, 0)}
              </strong>
              <p className="supporting-copy">
                Guests currently waiting for staff attention from QR.
              </p>
            </article>
            <article className="panel metric-card">
              <span className="metric-label">Floor issues</span>
              <strong className="metric-value">
                {outlets.reduce(
                  (sum, outlet) =>
                    sum + outlet.outOfServiceTables + outlet.tablesWithoutQr,
                  0,
                )}
              </strong>
              <p className="supporting-copy">
                Out-of-service tables plus live QR coverage gaps.
              </p>
            </article>
            <article className="panel metric-card">
              <span className="metric-label">Live sync</span>
              <strong className="metric-value">
                {formatRealtimeStatus(realtimeStatus)}
              </strong>
              <p className="supporting-copy">
                Multi-outlet service updates are streaming into this dashboard.
              </p>
            </article>
          </section>

          <section className="panel section-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Outlet boards</p>
                <h2 className="section-title serif">
                  Where the shift needs attention
                </h2>
                <p className="supporting-copy">
                  Start with orders if service is active, or tables if floor
                  resets and seating state are the priority.
                </p>
              </div>
            </div>

            <div className="operations-grid">
              {outlets.map((entry) => (
                <article className="panel queue-card" key={entry.outlet.id}>
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
                      KDS view
                    </Link>
                    <Link
                      className="secondary-button"
                      href={`/outlets/${entry.outlet.id}/tables`}
                    >
                      View tables
                    </Link>
                    <Link
                      className="secondary-button"
                      href={`/outlets/${entry.outlet.id}/pos`}
                    >
                      POS next
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
