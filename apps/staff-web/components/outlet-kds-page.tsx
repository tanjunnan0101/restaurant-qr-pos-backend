'use client';

import Link from 'next/link';
import {
  FormEvent,
  MouseEvent,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import { getOrder, getOrders, getPrintingSettings, updateOrderStatus } from '@/lib/api';
import { createOperationsSocket, outletOperationsEvents } from '@/lib/realtime';
import type { OrderDetail, OrderListEntry, RealtimeStatus } from '@/lib/types';
import {
  OutletHeader,
  OutletPageLayout,
  useOutletContext,
} from './outlet-page-base';

const kitchenStatuses = ['SENT_TO_KITCHEN', 'PREPARING', 'READY'] as const;

type KitchenStatus = (typeof kitchenStatuses)[number];
type KitchenStageFilter = KitchenStatus | 'ALL';
type StationFilter = 'ALL' | string;

export function OutletKdsPage() {
  const {
    session,
    outlet,
    outletId,
    error: outletError,
    busy: outletBusy,
  } = useOutletContext();
  const [orders, setOrders] = useState<OrderListEntry[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [busy, setBusy] = useState(true);
  const [detailBusy, setDetailBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [quickActionOrderId, setQuickActionOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('Kitchen updated the ticket status.');
  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState<KitchenStageFilter>('ALL');
  const [stationFilter, setStationFilter] = useState<StationFilter>('ALL');
  const [stationNameById, setStationNameById] = useState<Record<string, string>>({});
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
        const result = await getOrders(authToken, outletId);
        const liveKitchenOrders = result.filter((order) =>
          kitchenStatuses.includes(order.status as KitchenStatus),
        );

        if (!cancelled) {
          setOrders(liveKitchenOrders);
          setSelectedOrderId((current) =>
            current && liveKitchenOrders.some((order) => order.id === current)
              ? current
              : (liveKitchenOrders[0]?.id ?? null),
          );
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Kitchen queue failed to load.',
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
      setStationNameById({});
      return;
    }

    const authToken = session.accessToken;
    let cancelled = false;

    async function loadStations() {
      try {
        const result = await getPrintingSettings(authToken, outletId);
        if (cancelled) {
          return;
        }

        setStationNameById((current) => {
          const next = { ...current };
          for (const station of result.stations) {
            next[station.id] = station.name;
          }
          return next;
        });
      } catch {
        if (!cancelled) {
          setStationNameById((current) => current);
        }
      }
    }

    void loadStations();
    return () => {
      cancelled = true;
    };
  }, [outletId, session]);

  useEffect(() => {
    if (!session?.accessToken || !selectedOrderId || !outletId) {
      setSelectedOrder(null);
      return;
    }
    const authToken = session.accessToken;
    const currentOrderId = selectedOrderId;
    let cancelled = false;

    async function loadDetail() {
      setDetailBusy(true);
      try {
        const detail = await getOrder(authToken, outletId, currentOrderId);
        if (!cancelled) {
          setSelectedOrder(detail);
          setReason(defaultKitchenReason(detail.status));
          setStationNameById((current) => {
            const next = { ...current };
            for (const ticket of detail.kitchenTickets) {
              if (ticket.station?.name) {
                next[ticket.stationId] = ticket.station.name;
              }
            }
            return next;
          });
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Kitchen ticket failed to load.',
          );
        }
      } finally {
        if (!cancelled) {
          setDetailBusy(false);
        }
      }
    }

    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [outletId, refreshTick, selectedOrderId, session]);

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

  async function submitKitchenAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextAction = selectedOrder ? nextKitchenAction(selectedOrder.status) : null;
    if (!session?.accessToken || !selectedOrder || !outletId || !nextAction) {
      return;
    }

    setActionBusy(true);
    setError(null);

    try {
      const updated = await updateOrderStatus(
        session.accessToken,
        outletId,
        selectedOrder.id,
        {
          status: nextAction.status,
          reason,
        },
      );

      setSelectedOrder(updated);
      setOrders((current) => {
        const nextOrders = current
          .map((order) =>
            order.id === updated.id
              ? {
                  ...order,
                  status: updated.status,
                  paymentStatus: updated.paymentStatus,
                  updatedAt: updated.updatedAt,
                  kitchenTickets: updated.kitchenTickets.map((ticket) => ({
                    id: ticket.id,
                    status: ticket.status,
                    stationId: ticket.stationId,
                  })),
                }
              : order,
          )
          .filter((order) => kitchenStatuses.includes(order.status as KitchenStatus));

        return nextOrders;
      });
      setReason(defaultKitchenReason(updated.status));
      queueRefresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Kitchen status update failed.',
      );
    } finally {
      setActionBusy(false);
    }
  }

  async function handleQuickAdvance(
    event: MouseEvent<HTMLButtonElement>,
    order: OrderListEntry,
  ) {
    event.stopPropagation();
    const nextAction = nextKitchenAction(order.status);
    if (!session?.accessToken || !outletId || !nextAction) {
      return;
    }

    setQuickActionOrderId(order.id);
    setError(null);
    try {
      const updated = await updateOrderStatus(
        session.accessToken,
        outletId,
        order.id,
        {
          status: nextAction.status,
          reason: defaultKitchenReason(order.status),
        },
      );

      setOrders((current) =>
        current
          .map((entry) =>
            entry.id === updated.id
              ? {
                  ...entry,
                  status: updated.status,
                  paymentStatus: updated.paymentStatus,
                  updatedAt: updated.updatedAt,
                  kitchenTickets: updated.kitchenTickets.map((ticket) => ({
                    id: ticket.id,
                    status: ticket.status,
                    stationId: ticket.stationId,
                  })),
                }
              : entry,
          )
          .filter((entry) => kitchenStatuses.includes(entry.status as KitchenStatus)),
      );

      if (selectedOrderId === updated.id) {
        setSelectedOrder(updated);
        setReason(defaultKitchenReason(updated.status));
      }
      queueRefresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Kitchen status update failed.',
      );
    } finally {
      setQuickActionOrderId(null);
    }
  }

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const stationOptions = useMemo(() => {
    const entries = new Map<string, string>();
    for (const order of orders) {
      for (const ticket of order.kitchenTickets) {
        entries.set(ticket.stationId, stationNameById[ticket.stationId] ?? shortStationLabel(ticket.stationId));
      }
    }
    return Array.from(entries.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [orders, stationNameById]);
  const filteredOrders = orders.filter((order) => {
    if (stageFilter !== 'ALL' && order.status !== stageFilter) {
      return false;
    }
    if (
      stationFilter !== 'ALL' &&
      !order.kitchenTickets.some((ticket) => ticket.stationId === stationFilter)
    ) {
      return false;
    }
    if (!normalizedSearch) {
      return true;
    }
    const haystack = [
      order.orderNumber,
      order.customerName,
      order.customerPhone,
      order.table?.displayName,
      order.table?.tableCode,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalizedSearch);
  });

  useEffect(() => {
    if (
      stationFilter !== 'ALL' &&
      !stationOptions.some((station) => station.id === stationFilter)
    ) {
      setStationFilter('ALL');
    }
  }, [stationFilter, stationOptions]);

  useEffect(() => {
    setSelectedOrderId((current) =>
      current && filteredOrders.some((order) => order.id === current)
        ? current
        : (filteredOrders[0]?.id ?? null),
    );
  }, [filteredOrders]);

  const groupedOrders = kitchenStatuses.map((status) => ({
    status,
    orders: filteredOrders
      .filter((order) => order.status === status)
      .slice()
      .sort(
        (left, right) =>
          new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
      ),
  }));
  const oldestQueuedOrder = filteredOrders
    .slice()
    .sort(
      (left, right) =>
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
    )[0];
  const nextAction = selectedOrder ? nextKitchenAction(selectedOrder.status) : null;
  const sentToKitchenCount =
    groupedOrders.find((entry) => entry.status === 'SENT_TO_KITCHEN')?.orders.length ??
    0;
  const preparingCount =
    groupedOrders.find((entry) => entry.status === 'PREPARING')?.orders.length ?? 0;
  const readyCount =
    groupedOrders.find((entry) => entry.status === 'READY')?.orders.length ?? 0;

  return (
    <OutletPageLayout
      title="Kitchen display"
      subtitle="Follow live production flow from new paid tickets through ready handoff."
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

      <section className="workspace-hero workspace-hero--staff">
        <div className="workspace-hero__header">
          <div className="workspace-hero__copy">
            <p className="eyebrow">Kitchen rhythm</p>
            <h2 className="section-title serif">Run the line with clarity</h2>
            <p className="supporting-copy">
              Surface what just landed, what is in prep, and what is ready for
              handoff so the kitchen board reads like a live production system.
            </p>
          </div>
          <div className="workspace-pill-grid">
            <div className="workspace-pill current">
              <span>Realtime</span>
              <strong>{formatRealtimeStatus(realtimeStatus)}</strong>
            </div>
            <div className="workspace-pill">
              <span>Stations</span>
              <strong>
                {stationOptions.length === 0
                  ? 'No station filter'
                  : `${stationOptions.length} active`}
              </strong>
            </div>
          </div>
        </div>
        <div className="operations-summary-grid">
          <article className="operations-summary-card">
            <span className="metric-label">New tickets</span>
            <strong>{sentToKitchenCount}</strong>
            <p className="supporting-copy">
              Paid tickets waiting to enter active prep.
            </p>
          </article>
          <article className="operations-summary-card">
            <span className="metric-label">In prep</span>
            <strong>{preparingCount}</strong>
            <p className="supporting-copy">
              Tickets currently being worked on by the kitchen.
            </p>
          </article>
          <article className="operations-summary-card">
            <span className="metric-label">Ready</span>
            <strong>{readyCount}</strong>
            <p className="supporting-copy">
              Orders waiting for service handoff or pickup.
            </p>
          </article>
          <article className="operations-summary-card">
            <span className="metric-label">Oldest wait</span>
            <strong>
              {oldestQueuedOrder
                ? formatRelativeTime(oldestQueuedOrder.createdAt)
                : 'None'}
            </strong>
            <p className="supporting-copy">
              {oldestQueuedOrder
                ? `Ticket #${oldestQueuedOrder.orderNumber} has been in queue the longest.`
                : 'No active kitchen wait at the moment.'}
            </p>
          </article>
        </div>
      </section>

      <section className="metric-board">
        {groupedOrders.map((entry) => (
          <article className="panel metric-card" key={entry.status}>
            <span className="metric-label">{formatEnum(entry.status)}</span>
            <strong className="metric-value">{entry.orders.length}</strong>
            <p className="supporting-copy">
              {kitchenCopyForStatus(entry.status)}
            </p>
          </article>
        ))}
        <article className="panel metric-card">
          <span className="metric-label">Live sync</span>
          <strong className="metric-value">
            {formatRealtimeStatus(realtimeStatus)}
          </strong>
          <p className="supporting-copy">
            Outlet events are now streaming into the kitchen queue.
          </p>
        </article>
        <article className="panel metric-card">
          <span className="metric-label">Filtered tickets</span>
          <strong className="metric-value">{filteredOrders.length}</strong>
          <p className="supporting-copy">
            {stageFilter === 'ALL'
              ? 'All active kitchen tickets in scope.'
              : `${formatEnum(stageFilter)} tickets in scope.`}
          </p>
        </article>
        <article className="panel metric-card">
          <span className="metric-label">Oldest queued</span>
          <strong className="metric-value">
            {oldestQueuedOrder
              ? formatRelativeTime(oldestQueuedOrder.createdAt)
              : 'None'}
          </strong>
          <p className="supporting-copy">
            {oldestQueuedOrder
              ? `Ticket #${oldestQueuedOrder.orderNumber} has been waiting the longest.`
              : 'No active kitchen tickets right now.'}
          </p>
        </article>
      </section>

      <section className="operations-layout">
        <div className="panel section-panel queue-card--upgraded">
          <div className="section-header">
            <div>
              <p className="eyebrow">Kitchen queue</p>
              <h2 className="section-title serif">Production board</h2>
              <p className="supporting-copy">
                New paid orders enter automatically. Move them through prep and
                ready states from here.
              </p>
            </div>
          </div>

          <div className="form-grid">
            <div className="field">
              <label htmlFor="kds-search">Find a ticket</label>
              <input
                id="kds-search"
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by order, guest, table, or phone"
                value={searchTerm}
              />
            </div>
            <div className="field">
              <label htmlFor="kds-stage-filter">Stage focus</label>
              <select
                id="kds-stage-filter"
                onChange={(event) =>
                  setStageFilter(event.target.value as KitchenStageFilter)
                }
                value={stageFilter}
              >
                <option value="ALL">All kitchen stages</option>
                {kitchenStatuses.map((status) => (
                  <option key={status} value={status}>
                    {formatEnum(status)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="kds-station-filter">Station focus</label>
              <select
                id="kds-station-filter"
                onChange={(event) => setStationFilter(event.target.value)}
                value={stationFilter}
              >
                <option value="ALL">All stations</option>
                {stationOptions.map((station) => (
                  <option key={station.id} value={station.id}>
                    {station.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {busy ? (
            <p className="supporting-copy">Loading kitchen queue...</p>
          ) : filteredOrders.length === 0 ? (
            <div className="empty-state">
              <h3>No matching kitchen tickets</h3>
              <p className="supporting-copy">
                Try a broader stage or clear the search to see the full kitchen
                queue.
              </p>
            </div>
          ) : (
            <div className="operations-grid">
              {groupedOrders.map((entry) => (
                <article className="sub-panel queue-column-card" key={entry.status}>
                  <div className="section-header">
                    <div>
                      <h3>{formatEnum(entry.status)}</h3>
                      <p className="supporting-copy">
                        {entry.orders.length} ticket
                        {entry.orders.length === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>

                  <div className="stack-list">
                    {entry.orders.length === 0 ? (
                      <p className="supporting-copy">
                        No tickets in this stage right now.
                      </p>
                    ) : (
                      entry.orders.map((order) => (
                        <button
                          className={
                            selectedOrderId === order.id
                              ? 'order-list-item order-list-item--upgraded current'
                              : 'order-list-item order-list-item--upgraded'
                          }
                          key={order.id}
                          onClick={() => setSelectedOrderId(order.id)}
                          type="button"
                        >
                          <div className="section-header">
                            <div>
                              <strong>#{order.orderNumber}</strong>
                              <p className="supporting-copy">
                                {order.table?.displayName ?? 'No table'} |{' '}
                                {order.customerName ?? 'Walk-in / guest'}
                              </p>
                              <p className="supporting-copy">
                                {describeOrderStations(order, stationNameById)}
                              </p>
                            </div>
                            <span className={`status-pill ${statusTone(order.status)}`}>
                              {formatEnum(order.status)}
                            </span>
                          </div>
                          <div className="queue-metrics">
                            <div className="metric-inline">
                              <span>Tickets</span>
                              <strong>{order.kitchenTickets.length}</strong>
                            </div>
                            <div className="metric-inline">
                              <span>Total</span>
                              <strong>
                                {formatMoney(order.currency, order.grandTotalCents)}
                              </strong>
                            </div>
                            <div className="metric-inline">
                              <span>Updated</span>
                              <strong>{formatRelativeTime(order.updatedAt)}</strong>
                            </div>
                          </div>
                          <div className="inline-actions">
                            {nextKitchenAction(order.status) ? (
                              <button
                                className="secondary-button"
                                disabled={quickActionOrderId === order.id}
                                onClick={(event) => void handleQuickAdvance(event, order)}
                                type="button"
                              >
                                {quickActionOrderId === order.id
                                  ? 'Updating...'
                                  : nextKitchenAction(order.status)?.label}
                              </button>
                            ) : null}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="panel section-panel detail-panel detail-panel--upgraded">
          {detailBusy ? (
            <p className="supporting-copy">Loading ticket detail...</p>
          ) : !selectedOrder ? (
            <div className="empty-state">
              <h3>Select a kitchen ticket</h3>
              <p className="supporting-copy">
                The detail panel will show the items, modifiers, and next kitchen
                action.
              </p>
            </div>
          ) : (
            <>
              <div className="section-header">
                <div>
                  <p className="eyebrow">Ticket detail</p>
                  <h2 className="section-title serif">
                    #{selectedOrder.orderNumber}
                  </h2>
                  <p className="supporting-copy">
                    {selectedOrder.table?.zone?.name ?? 'No zone'} |{' '}
                    {selectedOrder.table?.displayName ?? 'No table'} |{' '}
                    {formatRelativeTime(selectedOrder.createdAt)}
                  </p>
                </div>
                <div className="inline-actions">
                  <Link
                    className="secondary-button"
                    href={`/outlets/${outletId}/orders/${selectedOrder.id}`}
                  >
                    Open full order detail
                  </Link>
                  <span className={`status-pill ${statusTone(selectedOrder.status)}`}>
                    {formatEnum(selectedOrder.status)}
                  </span>
                </div>
              </div>

              <article className="sub-panel surface-panel">
                <h3>Items to prepare</h3>
                <div className="stack-list">
                  {selectedOrder.items.map((item) => (
                    <div className="stack-row" key={item.id}>
                      <div>
                        <strong>
                          {item.quantity} x {item.itemName}
                        </strong>
                        {item.variantName ? (
                          <p className="supporting-copy">
                            Variant: {item.variantName}
                          </p>
                        ) : null}
                        {item.modifiers.length ? (
                          <ul className="sub-list">
                            {item.modifiers.map((modifier) => (
                              <li key={modifier.id}>
                                {modifier.modifierOptionName}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {item.remarks ? (
                          <p className="supporting-copy">Note: {item.remarks}</p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="sub-panel surface-panel">
                <h3>Kitchen tickets</h3>
                <div className="stack-list">
                  {selectedOrder.kitchenTickets.map((ticket) => (
                    <div className="stack-row" key={ticket.id}>
                      <div>
                        <strong>{ticket.station?.name ?? 'Kitchen station'}</strong>
                        <p className="supporting-copy">
                          Ticket {ticket.id.slice(0, 8)}
                        </p>
                      </div>
                      <span className={`status-pill ${statusTone(ticket.status)}`}>
                        {formatEnum(ticket.status)}
                      </span>
                    </div>
                  ))}
                </div>
              </article>

              <article className="sub-panel surface-panel">
                <h3>Next kitchen action</h3>
                {nextAction ? (
                  <form className="form-grid" onSubmit={submitKitchenAction}>
                    <p className="supporting-copy">
                      This ticket can move to{' '}
                      <strong>{formatEnum(nextAction.status)}</strong>.
                    </p>
                    <div className="field">
                      <label htmlFor="kds-reason">Reason</label>
                      <textarea
                        id="kds-reason"
                        onChange={(event) => setReason(event.target.value)}
                        rows={3}
                        value={reason}
                      />
                    </div>
                    <button
                      className="primary-button"
                      disabled={actionBusy || reason.trim().length < 3}
                      type="submit"
                    >
                      {actionBusy ? 'Updating...' : nextAction.label}
                    </button>
                  </form>
                ) : (
                  <p className="supporting-copy">
                    No kitchen action is available from this state. Front-of-house
                    can complete later service actions from the orders board.
                  </p>
                )}
              </article>
            </>
          )}
        </div>
      </section>
    </OutletPageLayout>
  );
}

function nextKitchenAction(status: string) {
  switch (status) {
    case 'SENT_TO_KITCHEN':
      return { status: 'PREPARING' as const, label: 'Start preparing' };
    case 'PREPARING':
      return { status: 'READY' as const, label: 'Mark ready for pickup' };
    case 'READY':
      return { status: 'SERVED' as const, label: 'Handover to service' };
    default:
      return null;
  }
}

function defaultKitchenReason(status: string) {
  const action = nextKitchenAction(status);
  if (!action) {
    return 'Kitchen updated the ticket status.';
  }
  return `Kitchen updated order to ${action.status.toLowerCase().replace('_', ' ')}.`;
}

function kitchenCopyForStatus(status: KitchenStatus) {
  switch (status) {
    case 'SENT_TO_KITCHEN':
      return 'Newly released paid tickets waiting for prep.';
    case 'PREPARING':
      return 'Tickets currently being worked on.';
    case 'READY':
      return 'Ready for pickup or service handoff.';
  }
}

function formatMoney(currency: string, cents: number) {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

function formatEnum(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function statusTone(status: string) {
  if (status === 'READY' || status === 'COMPLETED' || status === 'PRINTED') {
    return 'success';
  }
  if (
    status === 'FAILED' ||
    status === 'CANCELLED' ||
    status === 'OUT_OF_SERVICE'
  ) {
    return 'danger';
  }
  if (status === 'PREPARING' || status === 'PAYMENT_PROCESSING') {
    return 'warning';
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

function formatRelativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));
  if (diffMinutes < 1) {
    return 'just now';
  }
  if (diffMinutes === 1) {
    return '1 min ago';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} mins ago`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours === 1) {
    return '1 hour ago';
  }
  return `${diffHours} hours ago`;
}

function describeOrderStations(
  order: OrderListEntry,
  stationNameById: Record<string, string>,
) {
  const uniqueStations = Array.from(
    new Set(order.kitchenTickets.map((ticket) => ticket.stationId)),
  );
  if (uniqueStations.length === 0) {
    return 'No kitchen station assigned';
  }
  return uniqueStations
    .map((stationId) => stationNameById[stationId] ?? shortStationLabel(stationId))
    .join(', ');
}

function shortStationLabel(stationId: string) {
  return `Station ${stationId.slice(0, 8)}`;
}
