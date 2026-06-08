'use client';

import { useEffect, useState } from 'react';
import { getTables } from '@/lib/api';
import type { TableZone } from '@/lib/types';
import {
  OutletHeader,
  OutletPageLayout,
  useOutletContext,
} from './outlet-page-base';

export function OutletTablesPage() {
  const {
    session,
    outlet,
    outletId,
    error: outletError,
    busy: outletBusy,
  } = useOutletContext();
  const [zones, setZones] = useState<TableZone[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.accessToken || !outletId) {
      return;
    }
    const authToken = session.accessToken;
    let cancelled = false;

    async function load() {
      setBusy(true);
      setError(null);

      try {
        const result = await getTables(authToken, outletId);
        if (!cancelled) {
          setZones(result);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Tables failed to load.',
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

  const tables = zones.flatMap((zone) => zone.tables);
  const summary = {
    total: tables.length,
    available: tables.filter((table) => table.status === 'AVAILABLE').length,
    occupied: tables.filter((table) => table.status === 'OCCUPIED').length,
    reserved: tables.filter((table) => table.status === 'RESERVED').length,
    outOfService: tables.filter((table) => table.status === 'OUT_OF_SERVICE')
      .length,
  };

  return (
    <OutletPageLayout
      title="Table overview"
      subtitle="Zone-aware floor visibility for seating, QR coverage, and service state."
    >
      {outlet ? <OutletHeader outlet={outlet} /> : null}

      {outletBusy ? (
        <section className="panel section-panel">
          <p className="supporting-copy">Loading outlet context...</p>
        </section>
      ) : null}

      {outletError ? (
        <section className="panel section-panel">
          <div className="alert error">{outletError}</div>
        </section>
      ) : null}

      {error ? (
        <section className="panel section-panel">
          <div className="alert error">{error}</div>
        </section>
      ) : null}

      <section className="metric-board">
        <article className="panel metric-card">
          <span className="metric-label">Total tables</span>
          <strong className="metric-value">{summary.total}</strong>
        </article>
        <article className="panel metric-card">
          <span className="metric-label">Available</span>
          <strong className="metric-value">{summary.available}</strong>
        </article>
        <article className="panel metric-card">
          <span className="metric-label">Occupied</span>
          <strong className="metric-value">{summary.occupied}</strong>
        </article>
        <article className="panel metric-card">
          <span className="metric-label">Reserved / Out</span>
          <strong className="metric-value">
            {summary.reserved + summary.outOfService}
          </strong>
        </article>
      </section>

      <section className="zones-grid">
        {busy ? (
          <article className="panel section-panel">
            <p className="supporting-copy">Loading table zones...</p>
          </article>
        ) : zones.length === 0 ? (
          <article className="panel section-panel">
            <h2 className="section-title serif">No table layout yet</h2>
            <p className="supporting-copy">
              Dining zones and tables have not been configured for this outlet.
            </p>
          </article>
        ) : (
          zones.map((zone) => (
            <article className="panel section-panel" key={zone.id}>
              <div className="section-header">
                <div>
                  <p className="eyebrow">Zone</p>
                  <h2 className="section-title serif">{zone.name}</h2>
                </div>
                <span
                  className={`status-pill ${zone.active ? 'success' : 'neutral'}`}
                >
                  {zone.active ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="table-grid">
                {zone.tables.map((table) => (
                  <article className="table-card" key={table.id}>
                    <div className="section-header">
                      <div>
                        <strong>{table.displayName}</strong>
                        <p className="supporting-copy">{table.tableCode}</p>
                      </div>
                      <span
                        className={`status-pill ${statusTone(table.status)}`}
                      >
                        {formatEnum(table.status)}
                      </span>
                    </div>
                    <div className="table-meta">
                      <span>{table.shape}</span>
                      <span>
                        {table.capacity
                          ? `${table.capacity} seats`
                          : 'Flexible'}
                      </span>
                      <span>{table.active ? 'Enabled' : 'Disabled'}</span>
                    </div>
                    <div className="qr-list">
                      {table.qrCodes.length ? (
                        table.qrCodes.map((qr) => (
                          <div className="qr-row" key={qr.id}>
                            <span>{qr.publicCode}</span>
                            <small>
                              {qr.rotatedAt
                                ? `Rotated ${new Date(qr.rotatedAt).toLocaleDateString()}`
                                : 'Original QR'}
                            </small>
                          </div>
                        ))
                      ) : (
                        <p className="supporting-copy">
                          No QR codes issued yet.
                        </p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </article>
          ))
        )}
      </section>
    </OutletPageLayout>
  );
}

function formatEnum(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function statusTone(status: string) {
  if (status === 'AVAILABLE') {
    return 'success';
  }
  if (status === 'OCCUPIED' || status === 'RESERVED') {
    return 'warning';
  }
  if (status === 'OUT_OF_SERVICE') {
    return 'danger';
  }
  return 'neutral';
}
