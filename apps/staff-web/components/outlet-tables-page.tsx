'use client';

import Link from 'next/link';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import {
  getOrders,
  getTables,
  resolveTableServiceRequest,
  rotateTableQr,
  setupDiningTables,
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
  const [selectedZoneId, setSelectedZoneId] = useState<string>('');
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [actionTableId, setActionTableId] = useState<string | null>(null);
  const [qrActionTableId, setQrActionTableId] = useState<string | null>(null);
  const [serviceRequestActionId, setServiceRequestActionId] = useState<string | null>(
    null,
  );
  const [setupBusy, setSetupBusy] = useState(false);
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
  const canLoadDemoFloor = canManageTables && canManageQr;

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

  useEffect(() => {
    if (filteredZones.length === 0) {
      setSelectedZoneId('');
      return;
    }

    if (filteredZones.some((zone) => zone.id === selectedZoneId)) {
      return;
    }

    setSelectedZoneId(filteredZones[0]?.id ?? '');
  }, [filteredZones, selectedZoneId]);

  const tables = filteredZones.flatMap((zone) => zone.tables);
  const activeZone =
    filteredZones.find((zone) => zone.id === selectedZoneId) ??
    filteredZones[0] ??
    null;
  const boardTables = filteredZones.flatMap((zone) => zone.tables);
  const selectedTable =
    boardTables.find((table) => table.id === selectedTableId) ?? boardTables[0] ?? null;
  const selectedTableSnapshot = selectedTable
    ? tableOrderSnapshots[selectedTable.id]
    : undefined;
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
  const activeZoneCount = filteredZones.length;

  useEffect(() => {
    if (boardTables.length === 0) {
      setSelectedTableId('');
      return;
    }

    if (boardTables.some((table) => table.id === selectedTableId)) {
      return;
    }

    setSelectedTableId(boardTables[0]?.id ?? '');
  }, [boardTables, selectedTableId]);

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

  async function handleLoadDemoFloor() {
    if (!session?.accessToken || !outletId) {
      return;
    }

    setSetupBusy(true);
    setError(null);
    try {
      const result = await setupDiningTables(session.accessToken, outletId, {
        rotateExistingQr: false,
        zones: [
          {
            name: 'Main Floor',
            displayOrder: 0,
            active: true,
            tables: [
              { tableCode: 'T01', displayName: 'Table 1', capacity: 2, shape: 'SQUARE' },
              { tableCode: 'T02', displayName: 'Table 2', capacity: 2, shape: 'SQUARE' },
              { tableCode: 'T03', displayName: 'Table 3', capacity: 4, shape: 'RECTANGLE' },
              { tableCode: 'T04', displayName: 'Table 4', capacity: 4, shape: 'RECTANGLE' },
              { tableCode: 'T05', displayName: 'Table 5', capacity: 6, shape: 'ROUND' },
              { tableCode: 'T06', displayName: 'Table 6', capacity: 6, shape: 'ROUND' },
            ],
          },
          {
            name: 'Window Side',
            displayOrder: 1,
            active: true,
            tables: [
              { tableCode: 'T07', displayName: 'Table 7', capacity: 2, shape: 'SQUARE' },
              { tableCode: 'T08', displayName: 'Table 8', capacity: 2, shape: 'SQUARE' },
              { tableCode: 'T09', displayName: 'Table 9', capacity: 4, shape: 'RECTANGLE' },
              { tableCode: 'T10', displayName: 'Table 10', capacity: 4, shape: 'RECTANGLE' },
            ],
          },
        ],
      });
      setZones(result.zones);
      setFreshQrUrls(
        Object.fromEntries(
          result.qrCodes
            .filter((entry) => entry.qrUrl)
            .map((entry) => [entry.tableId, entry.qrUrl as string]),
        ),
      );
      setSelectedZoneId(result.zones[0]?.id ?? '');
      setSelectedTableId(result.zones[0]?.tables[0]?.id ?? '');
    } catch (setupError) {
      setError(
        setupError instanceof Error
          ? setupError.message
          : 'The sample floor could not be prepared.',
      );
    } finally {
      setSetupBusy(false);
    }
  }

  return (
    <OutletPageLayout
      title="Tables"
      subtitle="Live floor board for seating, guest help, QR coverage, and direct handoff into POS."
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

      <section className="operations-layout floor-board-layout">
        <aside className="panel section-panel floor-control-rail">
          <div className="section-header">
            <div>
              <p className="eyebrow">Floor controls</p>
              <h2 className="section-title">Whole floor visibility</h2>
              <p className="supporting-copy">
                Search, filter, and operate tables from a full-room board.
              </p>
            </div>
            <div className="table-inspector__actions">
              <span className={`status-pill ${realtimeStatus === 'connected' ? 'success' : realtimeStatus === 'error' ? 'danger' : 'warning'}`}>
                {formatRealtimeStatus(realtimeStatus)}
              </span>
              <button
                className="secondary-button"
                disabled={setupBusy || !canLoadDemoFloor}
                onClick={() => void handleLoadDemoFloor()}
                type="button"
              >
                {setupBusy ? 'Loading tables...' : 'Load tables'}
              </button>
            </div>
          </div>
          {canLoadDemoFloor ? (
            <p className="support-note">
              Loads a ready-to-use 10-table sample floor across two zones so the
              team can test seating, QR handoff, and POS actions immediately.
            </p>
          ) : (
            <p className="support-note">
              This floor setup action needs table and QR manage access.
            </p>
          )}

          <div className="form-grid floor-control-form">
            <div className="field">
              <label htmlFor="table-search">Search tables</label>
              <input
                id="table-search"
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Zone, code, QR, shape"
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
                    {status === 'ALL' ? 'All states' : formatEnum(status)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="detail-overview-grid floor-summary-grid">
            <article className="sub-panel surface-panel">
              <span className="metric-label">Tables</span>
              <strong className="scope-card-value">{summary.total}</strong>
              <p className="supporting-copy">Visible after filters.</p>
            </article>
            <article className="sub-panel surface-panel">
              <span className="metric-label">Occupied</span>
              <strong className="scope-card-value">{summary.occupied}</strong>
              <p className="supporting-copy">Currently in service.</p>
            </article>
            <article className="sub-panel surface-panel">
              <span className="metric-label">Help</span>
              <strong className="scope-card-value">{summary.helpRequests}</strong>
              <p className="supporting-copy">Open guest requests.</p>
            </article>
            <article className="sub-panel surface-panel">
              <span className="metric-label">QR</span>
              <strong className="scope-card-value">
                {summary.total === 0 ? '0/0' : `${summary.withQr}/${summary.total}`}
              </strong>
              <p className="supporting-copy">Active QR coverage.</p>
            </article>
          </div>
        </aside>

        <section className="panel section-panel floor-board-panel">
          {busy ? (
            <div className="empty-state">
              <h3>Loading table board...</h3>
              <p className="supporting-copy">Pulling live table and order state.</p>
            </div>
          ) : zones.length === 0 ? (
            <div className="empty-state">
              <h3>No table layout yet</h3>
              <p className="supporting-copy">
                Dining zones and tables have not been configured for this outlet.
              </p>
            </div>
          ) : filteredZones.length === 0 ? (
            <div className="empty-state">
              <h3>No matching tables</h3>
              <p className="supporting-copy">
                Clear the search or broaden the filter to bring tables back into view.
              </p>
            </div>
          ) : (
            <>
              <div className="section-header">
                <div>
                  <p className="eyebrow">Table board</p>
                  <h2 className="section-title">
                    {activeZone ? activeZone.name : 'Whole floor'}
                  </h2>
                  <p className="supporting-copy">
                    {boardTables.length} table{boardTables.length === 1 ? '' : 's'} visible across{' '}
                    {filteredZones.length} zone{filteredZones.length === 1 ? '' : 's'}.
                  </p>
                </div>
                <span className={`status-pill ${activeZone?.active ? 'success' : 'neutral'}`}>
                  {activeZone?.active ? 'Floor active' : 'Floor inactive'}
                </span>
              </div>

              <div className="floor-zone-bar">
                {filteredZones.map((zone) => (
                  <button
                    className={
                      zone.id === activeZone?.id
                        ? 'floor-zone-chip active'
                        : 'floor-zone-chip'
                    }
                    key={zone.id}
                    onClick={() => setSelectedZoneId(zone.id)}
                    type="button"
                  >
                    <strong>{zone.name}</strong>
                    <span>{zone.tables.length} tables</span>
                  </button>
                ))}
              </div>

              <div className="floor-workspace">
                <section className="sub-panel surface-panel floor-canvas">
                  <div className="floor-canvas__header">
                    <div>
                      <span className="metric-label">Floor map</span>
                      <h3 className="section-title">Tap a table to operate</h3>
                    </div>
                    <p className="supporting-copy">
                      Every zone stays visible at once so the team can scan the whole room in one pass.
                    </p>
                  </div>

                  <div className="floor-zone-board">
                    {filteredZones.map((zone) => (
                      <section className="floor-zone-section" key={zone.id}>
                        <div className="floor-zone-section__header">
                          <div>
                            <h4>{zone.name}</h4>
                            <p className="supporting-copy">
                              {zone.tables.length} table{zone.tables.length === 1 ? '' : 's'}
                            </p>
                          </div>
                          <span
                            className={`status-pill ${
                              zone.id === activeZone?.id
                                ? 'info'
                                : zone.active
                                  ? 'success'
                                  : 'neutral'
                            }`}
                          >
                            {zone.id === activeZone?.id
                              ? 'Focus zone'
                              : zone.active
                                ? 'Visible'
                                : 'Inactive'}
                          </span>
                        </div>

                        <div className="floor-tile-grid">
                          {zone.tables.map((table) => {
                            const snapshot = tableOrderSnapshots[table.id];
                            const hasHelp = table.serviceRequests.length > 0;

                            return (
                              <button
                                className={
                                  table.id === selectedTable?.id
                                    ? 'floor-tile active'
                                    : 'floor-tile'
                                }
                                key={table.id}
                                onClick={() => {
                                  setSelectedZoneId(zone.id);
                                  setSelectedTableId(table.id);
                                }}
                                type="button"
                              >
                                <div className="floor-tile__badges">
                                  <span className={`status-pill ${statusTone(table.status)}`}>
                                    {formatEnum(table.status)}
                                  </span>
                                  {hasHelp ? (
                                    <span className="mini-badge mini-badge--danger">
                                      Help
                                    </span>
                                  ) : null}
                                </div>
                                <div
                                  className={`floor-tile__surface floor-tile__surface--${shapeClass(table.shape)}`}
                                >
                                  <strong>{table.tableCode}</strong>
                                </div>
                                <div className="floor-tile__copy">
                                  <strong>{table.displayName}</strong>
                                  <span>
                                    {table.capacity ? `${table.capacity} seats` : 'Flexible seating'}
                                  </span>
                                </div>
                                <div className="floor-tile__footer">
                                  <span>{snapshot?.activeCount ?? 0} live</span>
                                  <span>
                                    {table.qrCodes.length > 0
                                      ? `QR ${table.qrCodes[0].publicCode}`
                                      : 'No QR'}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                </section>

                {selectedTable ? (
                  <aside className="sub-panel surface-panel table-inspector">
                    <div className="table-inspector__hero">
                      <div>
                        <span className="metric-label">Selected table</span>
                        <h3 className="section-title">{selectedTable.displayName}</h3>
                        <p className="supporting-copy">
                          {selectedTable.tableCode} | {formatEnum(selectedTable.shape)} |{' '}
                          {selectedTable.capacity
                            ? `${selectedTable.capacity} seats`
                            : 'Flexible seating'}
                        </p>
                      </div>
                      <span className={`status-pill ${statusTone(selectedTable.status)}`}>
                        {formatEnum(selectedTable.status)}
                      </span>
                    </div>

                    <div className="table-inspector__metrics">
                      <article className="sub-panel surface-panel">
                        <span className="metric-label">Live orders</span>
                        <strong className="scope-card-value">
                          {selectedTableSnapshot?.activeCount ?? 0}
                        </strong>
                      </article>
                      <article className="sub-panel surface-panel">
                        <span className="metric-label">Latest ticket</span>
                        <strong className="scope-card-value">
                          {selectedTableSnapshot?.latestOrderNumber
                            ? `#${selectedTableSnapshot.latestOrderNumber}`
                            : 'None'}
                        </strong>
                      </article>
                    </div>

                    <div className="table-card__meta">
                      <span>{selectedTable.active ? 'Enabled' : 'Disabled'}</span>
                      <span>
                        {selectedTable.qrCodes.length > 0
                          ? `QR ${selectedTable.qrCodes[0].publicCode}`
                          : 'No QR assigned'}
                      </span>
                      {selectedTableSnapshot?.latestStatus ? (
                        <span>{formatEnum(selectedTableSnapshot.latestStatus)}</span>
                      ) : null}
                    </div>

                    {selectedTable.serviceRequests.length > 0 ? (
                      <div className="table-card__callout table-card__callout--danger">
                        <strong>Guest needs help now</strong>
                        <p className="supporting-copy">
                          {selectedTable.serviceRequests[0]?.note?.trim() ||
                            formatEnum(selectedTable.serviceRequests[0]?.type ?? 'SERVICE')}
                        </p>
                      </div>
                    ) : (
                      <div className="soft-note">
                        <strong>No active help requests</strong>
                        <p className="supporting-copy">
                          This table is clear from guest assistance alerts.
                        </p>
                      </div>
                    )}

                    <div className="table-inspector__actions">
                      <Link
                        className="primary-button"
                        href={`/outlets/${outletId}/pos?tableId=${selectedTable.id}`}
                      >
                        Open POS
                      </Link>
                      <Link
                        className="secondary-button"
                        href={`/outlets/${outletId}/orders?tableId=${selectedTable.id}`}
                      >
                        View orders
                      </Link>
                      {selectedTableSnapshot?.latestOrderId ? (
                        <Link
                          className="secondary-button"
                          href={`/outlets/${outletId}/orders/${selectedTableSnapshot.latestOrderId}`}
                        >
                          Open latest ticket
                        </Link>
                      ) : null}
                    </div>

                    <div className="table-inspector__actions table-inspector__actions--secondary">
                      {selectedTable.serviceRequests.length > 0 ? (
                        <button
                          className="primary-button"
                          disabled={serviceRequestActionId !== null}
                          onClick={() =>
                            void handleResolveServiceRequest(
                              selectedTable.id,
                              selectedTable.serviceRequests[0].id,
                              selectedTable.displayName,
                            )
                          }
                          type="button"
                        >
                          {serviceRequestActionId === selectedTable.serviceRequests[0].id
                            ? 'Resolving...'
                            : 'Help delivered'}
                        </button>
                      ) : null}

                      {canManageQr ? (
                        <button
                          className="secondary-button"
                          disabled={qrActionTableId === selectedTable.id}
                          onClick={() =>
                            void handleRotateQr(
                              selectedTable.id,
                              selectedTable.displayName,
                            )
                          }
                          type="button"
                        >
                          {qrActionTableId === selectedTable.id
                            ? 'Rotating...'
                            : 'Rotate QR'}
                        </button>
                      ) : null}

                      {canManageTables ? (
                        selectedTable.status !== 'OCCUPIED' ? (
                          <button
                            className="secondary-button"
                            disabled={actionTableId === selectedTable.id}
                            onClick={() =>
                              void handleTableAction(
                                selectedTable.id,
                                'OCCUPIED',
                                `Staff seated guests at ${selectedTable.displayName}.`,
                              )
                            }
                            type="button"
                          >
                            {actionTableId === selectedTable.id ? 'Updating...' : 'Seat table'}
                          </button>
                        ) : (
                          <button
                            className="secondary-button"
                            disabled={actionTableId === selectedTable.id}
                            onClick={() =>
                              void handleTableAction(
                                selectedTable.id,
                                'AVAILABLE',
                                `Staff cleared ${selectedTable.displayName} after service.`,
                              )
                            }
                            type="button"
                          >
                            {actionTableId === selectedTable.id ? 'Updating...' : 'Clear table'}
                          </button>
                        )
                      ) : null}

                      {canManageTables ? (
                        selectedTable.status !== 'OUT_OF_SERVICE' ? (
                          <button
                            className="ghost-button"
                            disabled={actionTableId === selectedTable.id}
                            onClick={() =>
                              void handleTableAction(
                                selectedTable.id,
                                'OUT_OF_SERVICE',
                                `Staff marked ${selectedTable.displayName} out of service.`,
                              )
                            }
                            type="button"
                          >
                            Mark out of service
                          </button>
                        ) : (
                          <button
                            className="ghost-button"
                            disabled={actionTableId === selectedTable.id}
                            onClick={() =>
                              void handleTableAction(
                                selectedTable.id,
                                'AVAILABLE',
                                `Staff returned ${selectedTable.displayName} to service.`,
                              )
                            }
                            type="button"
                          >
                            Restore to floor
                          </button>
                        )
                      ) : null}
                    </div>

                    {freshQrUrls[selectedTable.id] ? (
                      <a
                        className="secondary-button full-width"
                        href={freshQrUrls[selectedTable.id]}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Open fresh QR URL
                      </a>
                    ) : null}
                  </aside>
                ) : null}
              </div>
            </>
          )}
        </section>
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

function shapeClass(shape: string) {
  const normalized = shape.toLowerCase();
  if (normalized.includes('round') || normalized.includes('circle')) {
    return 'round';
  }
  if (normalized.includes('rect')) {
    return 'rect';
  }
  return 'square';
}
