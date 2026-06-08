'use client';

import Link from 'next/link';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import {
  getOrders,
  getTables,
  resolveTableServiceRequest,
  rotateTableQr,
  updateTableStatus,
} from '@/lib/api';
import { createOperationsSocket, outletOperationsEvents } from '@/lib/realtime';
import type {
  DiningTableStatus,
  OrderListEntry,
  RealtimeStatus,
  TableZone,
} from '@/lib/types';
import {
  OutletHeader,
  OutletPageLayout,
  useOutletContext,
} from './outlet-page-base';

const tableStatusFilters = [
  'ALL',
  'AVAILABLE',
  'OCCUPIED',
  'RESERVED',
  'OUT_OF_SERVICE',
] as const;

type TableStatusFilter = (typeof tableStatusFilters)[number];

type TableOrderSnapshot = {
  activeCount: number;
  latestOrderId: string | null;
  latestOrderNumber: string | null;
  latestStatus: string | null;
};

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
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<TableStatusFilter>('ALL');
  const [actionTableId, setActionTableId] = useState<string | null>(null);
  const [qrActionTableId, setQrActionTableId] = useState<string | null>(null);
  const [serviceRequestActionId, setServiceRequestActionId] = useState<string | null>(
    null,
  );
  const [freshQrUrls, setFreshQrUrls] = useState<Record<string, string>>({});
  const [tableOrderSnapshots, setTableOrderSnapshots] = useState<
    Record<string, TableOrderSnapshot>
  >({});
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
    if (!session?.accessToken || !outletId) {
      return;
    }
    const authToken = session.accessToken;
    let cancelled = false;

    async function load() {
      setBusy(true);
      setError(null);

      try {
        const [tablesResult, ordersResult] = await Promise.allSettled([
          getTables(authToken, outletId),
          getOrders(authToken, outletId, 'ALL'),
        ]);
        if (tablesResult.status !== 'fulfilled') {
          throw tablesResult.reason;
        }
        if (!cancelled) {
          setZones(tablesResult.value);
          setTableOrderSnapshots(
            ordersResult.status === 'fulfilled'
              ? buildTableOrderSnapshots(ordersResult.value)
              : {},
          );
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
  }, [outletId, refreshTick, session]);

  useEffect(() => {
    if (!session?.accessToken || !outletId) {
      setRealtimeStatus('idle');
      return;
    }

    setRealtimeStatus('connecting');
    const socket = createOperationsSocket(session.accessToken);

    const subscribeToOutlet = () => {
      socket.emit(
        'subscribe.outlet',
        { outletId },
        (response?: { ok?: boolean; message?: string }) => {
          if (response?.ok) {
            setRealtimeStatus('connected');
            setError(null);
            queueRefresh();
            return;
          }
          setRealtimeStatus('error');
          if (response?.message) {
            setError(response.message);
          }
        },
      );
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
    socket.on('operations.connected', subscribeToOutlet);
    for (const eventName of outletOperationsEvents) {
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
      socket.off('operations.connected', subscribeToOutlet);
      socket.disconnect();
    };
  }, [outletId, queueRefresh, session]);

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const outletAccess = useMemo(
    () => session?.user.outlets.find((entry) => entry.id === outletId) ?? null,
    [outletId, session],
  );
  const canManageTables =
    outletAccess?.permissions.includes('table.manage') ?? false;
  const canManageQr = outletAccess?.permissions.includes('qr.manage') ?? false;

  const filteredZones = useMemo(
    () =>
      zones
        .map((zone) => ({
          ...zone,
          tables: zone.tables.filter((table) => {
            if (statusFilter !== 'ALL' && table.status !== statusFilter) {
              return false;
            }
            if (!normalizedSearch) {
              return true;
            }
            const haystack = [
              zone.name,
              table.displayName,
              table.tableCode,
              table.status,
              table.shape,
              table.qrCodes[0]?.publicCode,
              ...table.serviceRequests.map(
                (request) => `${request.type} ${request.status} ${request.note ?? ''}`,
              ),
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();
            return haystack.includes(normalizedSearch);
          }),
        }))
        .filter((zone) => zone.tables.length > 0),
    [normalizedSearch, statusFilter, zones],
  );

  const tables = filteredZones.flatMap((zone) => zone.tables);
  const summary = {
    total: tables.length,
    available: tables.filter((table) => table.status === 'AVAILABLE').length,
    occupied: tables.filter((table) => table.status === 'OCCUPIED').length,
    reserved: tables.filter((table) => table.status === 'RESERVED').length,
    outOfService: tables.filter((table) => table.status === 'OUT_OF_SERVICE')
      .length,
    withQr: tables.filter((table) => table.qrCodes.length > 0).length,
    helpRequests: tables.reduce(
      (total, table) => total + table.serviceRequests.length,
      0,
    ),
  };

  async function handleTableAction(
    tableId: string,
    status: DiningTableStatus,
    reason: string,
  ) {
    if (!session?.accessToken || !outletId) {
      return;
    }

    setActionTableId(tableId);
    setError(null);
    try {
      const updated = await updateTableStatus(session.accessToken, outletId, tableId, {
        status,
        reason,
      });
      setZones((current) =>
        current.map((zone) =>
          zone.id !== updated.zoneId
            ? zone
            : {
                ...zone,
                tables: zone.tables.map((table) =>
                  table.id === updated.id
                    ? { ...table, status: updated.status, active: updated.active }
                    : table,
                ),
              },
        ),
      );
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : 'Table status update failed.',
      );
    } finally {
      setActionTableId(null);
    }
  }

  async function handleRotateQr(tableId: string, displayName: string) {
    if (!session?.accessToken || !outletId) {
      return;
    }

    setQrActionTableId(tableId);
    setError(null);
    try {
      const rotated = await rotateTableQr(session.accessToken, outletId, tableId, {
        reason: `Staff rotated the QR for ${displayName}.`,
      });
      setFreshQrUrls((current) => ({
        ...current,
        [tableId]: rotated.qrUrl,
      }));
      queueRefresh();
    } catch (rotateError) {
      setError(
        rotateError instanceof Error
          ? rotateError.message
          : 'QR rotation failed.',
      );
    } finally {
      setQrActionTableId(null);
    }
  }

  async function handleResolveServiceRequest(
    tableId: string,
    requestId: string,
    displayName: string,
  ) {
    if (!session?.accessToken || !outletId) {
      return;
    }

    setServiceRequestActionId(requestId);
    setError(null);
    try {
      await resolveTableServiceRequest(
        session.accessToken,
        outletId,
        tableId,
        requestId,
        {
          note: `Staff assisted guests at ${displayName}.`,
        },
      );
      queueRefresh();
    } catch (resolveError) {
      setError(
        resolveError instanceof Error
          ? resolveError.message
          : 'Service request resolution failed.',
      );
    } finally {
      setServiceRequestActionId(null);
    }
  }

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
        <article className="panel metric-card">
          <span className="metric-label">Help requests</span>
          <strong className="metric-value">{summary.helpRequests}</strong>
        </article>
        <article className="panel metric-card">
          <span className="metric-label">QR coverage</span>
          <strong className="metric-value">
            {summary.withQr}/{summary.total}
          </strong>
        </article>
      </section>

      <section className="panel section-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Floor controls</p>
            <h2 className="section-title serif">Find a table fast</h2>
            <p className="supporting-copy">
              Filter by table state and jump into POS or customer menu flows
              from the floor view.
            </p>
            <p className="supporting-copy">
              Live sync: {formatRealtimeStatus(realtimeStatus)}
            </p>
          </div>
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="table-search">Search tables</label>
            <input
              id="table-search"
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by zone, table code, status, shape, or QR code"
              value={searchTerm}
            />
          </div>
          <div className="field">
            <label htmlFor="table-status-filter">Table state</label>
            <select
              id="table-status-filter"
              onChange={(event) =>
                setStatusFilter(event.target.value as TableStatusFilter)
              }
              value={statusFilter}
            >
              {tableStatusFilters.map((status) => (
                <option key={status} value={status}>
                  {status === 'ALL' ? 'All table states' : formatEnum(status)}
                </option>
              ))}
            </select>
          </div>
        </div>
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
        ) : filteredZones.length === 0 ? (
          <article className="panel section-panel">
            <h2 className="section-title serif">No matching tables</h2>
            <p className="supporting-copy">
              Clear the search or switch to a broader table state to see more
              of the floor plan.
            </p>
          </article>
        ) : (
          filteredZones.map((zone) => (
            <article className="panel section-panel" key={zone.id}>
              <div className="section-header">
                <div>
                  <p className="eyebrow">Zone</p>
                  <h2 className="section-title serif">{zone.name}</h2>
                  <p className="supporting-copy">
                    {zone.tables.length} table{zone.tables.length === 1 ? '' : 's'} in view
                  </p>
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
                    {tableOrderSnapshots[table.id] ? (
                      <div className="queue-metrics">
                        <div className="metric-inline">
                          <span>Live orders</span>
                          <strong>{tableOrderSnapshots[table.id].activeCount}</strong>
                        </div>
                        <div className="metric-inline">
                          <span>Latest ticket</span>
                          <strong>
                            {tableOrderSnapshots[table.id].latestOrderNumber
                              ? `#${tableOrderSnapshots[table.id].latestOrderNumber}`
                              : 'None'}
                          </strong>
                        </div>
                      </div>
                    ) : null}
                    {tableOrderSnapshots[table.id]?.latestStatus ? (
                      <p className="supporting-copy">
                        Latest order status:{' '}
                        {formatEnum(tableOrderSnapshots[table.id].latestStatus ?? '')}
                      </p>
                    ) : null}
                    {table.serviceRequests.length > 0 ? (
                      <div className="sub-panel">
                        <div className="section-header">
                          <div>
                            <strong>Guest needs help</strong>
                            <p className="supporting-copy">
                              {table.serviceRequests.length} open request
                              {table.serviceRequests.length === 1 ? '' : 's'} from
                              this table.
                            </p>
                          </div>
                          <span className="status-pill danger">Open</span>
                        </div>
                        <div className="stack-list">
                          {table.serviceRequests.map((request) => (
                            <div className="stack-row" key={request.id}>
                              <span>
                                {request.note?.trim() || formatEnum(request.type)}
                              </span>
                              <strong>
                                {new Date(request.requestedAt).toLocaleTimeString()}
                              </strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
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
                            <small>{qr.destinationPath}</small>
                          </div>
                        ))
                      ) : (
                        <p className="supporting-copy">
                          No QR codes issued yet.
                        </p>
                      )}
                    </div>
                    <div className="inline-actions">
                      <Link
                        className="primary-button"
                        href={`/outlets/${outletId}/pos?tableId=${table.id}`}
                      >
                        Open in POS
                      </Link>
                      <Link
                        className="secondary-button"
                        href={`/outlets/${outletId}/orders?tableId=${table.id}`}
                      >
                        View table queue
                      </Link>
                      {tableOrderSnapshots[table.id]?.latestOrderId ? (
                        <Link
                          className="secondary-button"
                          href={`/outlets/${outletId}/orders/${tableOrderSnapshots[table.id].latestOrderId}`}
                        >
                          Open latest ticket
                        </Link>
                      ) : null}
                      {canManageQr ? (
                        <button
                          className="secondary-button"
                          disabled={qrActionTableId === table.id}
                          onClick={() => void handleRotateQr(table.id, table.displayName)}
                          type="button"
                        >
                          {qrActionTableId === table.id ? 'Rotating...' : 'Rotate QR'}
                        </button>
                      ) : null}
                      {table.serviceRequests.length > 0 ? (
                        <button
                          className="primary-button"
                          disabled={serviceRequestActionId !== null}
                          onClick={() =>
                            void handleResolveServiceRequest(
                              table.id,
                              table.serviceRequests[0].id,
                              table.displayName,
                            )
                          }
                          type="button"
                        >
                          {serviceRequestActionId === table.serviceRequests[0].id
                            ? 'Resolving...'
                            : 'Mark help delivered'}
                        </button>
                      ) : null}
                      {canManageTables ? (
                        <>
                          {table.status !== 'OCCUPIED' ? (
                            <button
                              className="secondary-button"
                              disabled={actionTableId === table.id}
                              onClick={() =>
                                void handleTableAction(
                                  table.id,
                                  'OCCUPIED',
                                  `Staff seated guests at ${table.displayName}.`,
                                )
                              }
                              type="button"
                            >
                              {actionTableId === table.id ? 'Updating...' : 'Seat table'}
                            </button>
                          ) : (
                            <button
                              className="secondary-button"
                              disabled={actionTableId === table.id}
                              onClick={() =>
                                void handleTableAction(
                                  table.id,
                                  'AVAILABLE',
                                  `Staff cleared ${table.displayName} after service.`,
                                )
                              }
                              type="button"
                            >
                              {actionTableId === table.id ? 'Updating...' : 'Clear table'}
                            </button>
                          )}
                          {table.status !== 'RESERVED' ? (
                            <button
                              className="secondary-button"
                              disabled={actionTableId === table.id}
                              onClick={() =>
                                void handleTableAction(
                                  table.id,
                                  'RESERVED',
                                  `Staff reserved ${table.displayName} for an upcoming party.`,
                                )
                              }
                              type="button"
                            >
                              Reserve
                            </button>
                          ) : (
                            <button
                              className="secondary-button"
                              disabled={actionTableId === table.id}
                              onClick={() =>
                                void handleTableAction(
                                  table.id,
                                  'AVAILABLE',
                                  `Staff released the reservation on ${table.displayName}.`,
                                )
                              }
                              type="button"
                            >
                              Release reservation
                            </button>
                          )}
                          {table.status !== 'OUT_OF_SERVICE' ? (
                            <button
                              className="secondary-button"
                              disabled={actionTableId === table.id}
                              onClick={() =>
                                void handleTableAction(
                                  table.id,
                                  'OUT_OF_SERVICE',
                                  `Staff marked ${table.displayName} out of service.`,
                                )
                              }
                              type="button"
                            >
                              Mark out of service
                            </button>
                          ) : (
                            <button
                              className="secondary-button"
                              disabled={actionTableId === table.id}
                              onClick={() =>
                                void handleTableAction(
                                  table.id,
                                  'AVAILABLE',
                                  `Staff returned ${table.displayName} to service.`,
                                )
                              }
                              type="button"
                            >
                              Restore table
                            </button>
                          )}
                        </>
                      ) : null}
                    </div>
                    {table.qrCodes[0] ? (
                      <p className="supporting-copy">
                        QR is active. The full customer URL remains available only
                        when the code is first generated or rotated.
                      </p>
                    ) : null}
                    {freshQrUrls[table.id] ? (
                      <a
                        className="secondary-button"
                        href={freshQrUrls[table.id]}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Open freshly rotated QR URL
                      </a>
                    ) : null}
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

function buildTableOrderSnapshots(orders: OrderListEntry[]) {
  return orders.reduce<Record<string, TableOrderSnapshot>>((accumulator, order) => {
    const tableId = order.table?.id;
    if (!tableId) {
      return accumulator;
    }

    const snapshot = accumulator[tableId] ?? {
      activeCount: 0,
      latestOrderId: null,
      latestOrderNumber: null,
      latestStatus: null,
    };

    if (!snapshot.latestOrderId) {
      snapshot.latestOrderId = order.id;
      snapshot.latestOrderNumber = order.orderNumber;
      snapshot.latestStatus = order.status;
    }

    if (order.status !== 'COMPLETED' && order.status !== 'CANCELLED') {
      snapshot.activeCount += 1;
    }

    accumulator[tableId] = snapshot;
    return accumulator;
  }, {});
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
