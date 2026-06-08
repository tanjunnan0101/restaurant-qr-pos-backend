'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getOrders, getOutlets, getTables } from '@/lib/api';
import type { OutletOperationsSummary } from '@/lib/types';
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

export function DashboardPage() {
  const { session, loading } = useStaffSession();
  const [outlets, setOutlets] = useState<OutletOperationsSummary[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
            const occupiedTables = tables.reduce(
              (total, zone) =>
                total +
                zone.tables.filter((table) => table.status === 'OCCUPIED')
                  .length,
              0,
            );

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
              occupiedTables,
            } satisfies OutletOperationsSummary;
          }),
        );

        if (!cancelled) {
          setOutlets(summaries);
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
                    </div>
                    <span className="status-pill neutral">
                      {entry.outlet.status}
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
