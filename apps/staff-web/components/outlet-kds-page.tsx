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
  const filteredOrders = useMemo(
    () =>
      orders
        .filter((order) => {
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
        })
        .sort(
          (left, right) => {
            const priorityDelta =
              kitchenStatusPriority(left.status as KitchenStatus) -
              kitchenStatusPriority(right.status as KitchenStatus);
            if (priorityDelta !== 0) {
              return priorityDelta;
            }
            return (
              new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
            );
          },
        ),
    [normalizedSearch, orders, stageFilter, stationFilter],
  );

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
    orders: filteredOrders.filter((order) => order.status === status),
  }));
  const oldestQueuedOrder = filteredOrders[0];
  const nextAction = selectedOrder ? nextKitchenAction(selectedOrder.status) : null;
  const sentToKitchenCount =
    groupedOrders.find((entry) => entry.status === 'SENT_TO_KITCHEN')?.orders.length ??
    0;
  const preparingCount =
    groupedOrders.find((entry) => entry.status === 'PREPARING')?.orders.length ?? 0;
  const readyCount =
    groupedOrders.find((entry) => entry.status === 'READY')?.orders.length ?? 0;
  const selectedOrderTableLabel = selectedOrder?.table
    ? `${selectedOrder.table.zone?.name ?? 'No zone'} | ${selectedOrder.table.displayName}`
    : 'Counter / no table';

  return (
    <OutletPageLayout
      title="Kitchen"
      subtitle="Production lanes for new, preparing, and ready tickets."
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

      <section className="operations-layout kitchen-station-layout">
        <section className="panel section-panel queue-card--upgraded kitchen-board-panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">Kitchen board</p>
              <h2 className="section-title">Prep queue</h2>
              <p className="supporting-copy">
                Pull new tickets into prep, then release them back to service fast.
              </p>
            </div>
            <span
              className={`status-pill ${
                realtimeStatus === 'connected'
                  ? 'success'
                  : realtimeStatus === 'error'
                    ? 'danger'
                    : 'warning'
              }`}
            >
              {formatRealtimeStatus(realtimeStatus)}
            </span>
          </div>

          <div className="support-inline-meta support-inline-meta--board">
            <span>{filteredOrders.length} tickets currently visible</span>
            <span>
              {stationFilter === 'ALL'
                ? 'All stations in view'
                : `Filtered to ${stationOptions.find((station) => station.id === stationFilter)?.name ?? 'station'}`}
            </span>
          </div>

          <div className="form-grid kitchen-board-filters">
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
            <div className="service-board-filters__actions">
              {(searchTerm || stageFilter !== 'ALL' || stationFilter !== 'ALL') ? (
                <button
                  className="ghost-button"
                  onClick={() => {
                    setSearchTerm('');
                    setStageFilter('ALL');
                    setStationFilter('ALL');
                  }}
                  type="button"
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          </div>

          <div className="terminal-board-strip kitchen-lane-metrics">
            <article className="terminal-board-chip">
              <span>New</span>
              <strong>{sentToKitchenCount}</strong>
            </article>
            <article className="terminal-board-chip">
              <span>Preparing</span>
              <strong>{preparingCount}</strong>
            </article>
            <article className="terminal-board-chip">
              <span>Ready</span>
              <strong>{readyCount}</strong>
            </article>
            <article className="terminal-board-chip">
              <span>Oldest wait</span>
              <strong>
                {oldestQueuedOrder
                  ? formatRelativeTime(oldestQueuedOrder.createdAt)
                  : 'None'}
              </strong>
            </article>
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
            <div className="operations-grid kitchen-lane-grid kitchen-lane-grid--dense">
              {groupedOrders.map((entry) => (
                <article className="sub-panel queue-column-card kitchen-lane-card" key={entry.status}>
                  <div className="section-header">
                    <div>
                      <h3>{formatEnum(entry.status)}</h3>
                      <p className="supporting-copy">{kitchenCopyForStatus(entry.status)}</p>
                    </div>
                    <div className="support-inline-meta">
                      {entry.orders[0] ? (
                        <span>Lead {formatRelativeTime(entry.orders[0].createdAt)}</span>
                      ) : null}
                      <span className="status-pill neutral">
                        {entry.orders.length} ticket{entry.orders.length === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>

                  <div className="stack-list">
                    {entry.orders.length === 0 ? (
                      <p className="supporting-copy">
                        No tickets in this stage right now.
                      </p>
                    ) : (
                      entry.orders.map((order) => (
                        <article
                          className={
                            selectedOrderId === order.id
                              ? 'kitchen-ticket-card active'
                              : 'kitchen-ticket-card'
                          }
                          key={order.id}
                        >
                          <button
                            className="kitchen-ticket-card__select"
                            onClick={() => setSelectedOrderId(order.id)}
                            type="button"
                          >
                            <div className="kitchen-ticket-card__topline">
                              <span className="mini-badge">
                                {order.table?.tableCode ?? 'COUNTER'}
                              </span>
                              <span className="kitchen-ticket-card__age">
                                {formatRelativeTime(order.updatedAt)}
                              </span>
                            </div>
                            <div className="kitchen-ticket-card__header">
                              <div>
                                <strong>#{order.orderNumber}</strong>
                                <p className="supporting-copy">
                                  {order.table?.displayName ?? 'No table'} |{' '}
                                  {order.customerName ?? 'Walk-in / guest'}
                                </p>
                                <p className="supporting-copy kitchen-ticket-card__station-copy">
                                  {describeOrderStations(order, stationNameById)}
                                </p>
                              </div>
                              <div className="service-ticket-card__badges">
                                {entry.orders[0]?.id === order.id ? (
                                  <span className="mini-badge">Next up</span>
                                ) : null}
                                <span className={`status-pill ${statusTone(order.status)}`}>
                                  {formatEnum(order.status)}
                                </span>
                              </div>
                            </div>
                            <div className="kitchen-ticket-card__metrics">
                              <div className="metric-inline">
                                <span>Stations</span>
                                <strong>{order.kitchenTickets.length}</strong>
                              </div>
                              <div className="metric-inline">
                                <span>Next</span>
                                <strong>
                                  {nextKitchenAction(order.status)?.label ?? 'No action'}
                                </strong>
                              </div>
                              <div className="metric-inline">
                                <span>Total</span>
                                <strong>
                                  {formatMoney(order.currency, order.grandTotalCents)}
                                </strong>
                              </div>
                            </div>
                            <div className="kitchen-ticket-card__footer">
                              <span>{describeOrderStations(order, stationNameById)}</span>
                              {selectedOrderId === order.id ? (
                                <span className="mini-badge mini-badge--info">Selected</span>
                              ) : null}
                            </div>
                          </button>
                          {nextKitchenAction(order.status) ? (
                            <div className="kitchen-ticket-card__rail">
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
                            </div>
                          ) : null}
                        </article>
                      ))
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="panel section-panel detail-panel detail-panel--upgraded kitchen-inspector">
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
              <div className="service-inspector__hero">
                <div>
                  <p className="eyebrow">Selected ticket</p>
                  <h2 className="section-title">
                    #{selectedOrder.orderNumber}
                  </h2>
                  <p className="supporting-copy">
                    {selectedOrderTableLabel} |{' '}
                    {formatRelativeTime(selectedOrder.createdAt)}
                  </p>
                </div>
                <div className="service-inspector__actions">
                  {nextAction ? (
                    <span className="mini-badge mini-badge--info">
                      Next {nextAction.label}
                    </span>
                  ) : null}
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

              <div className="terminal-board-strip service-inspector__summary-strip">
                <article className="terminal-board-chip">
                  <span>Lane</span>
                  <strong>{formatEnum(selectedOrder.status)}</strong>
                </article>
                <article className="terminal-board-chip">
                  <span>Stations</span>
                  <strong>{selectedOrder.kitchenTickets.length}</strong>
                </article>
                <article className="terminal-board-chip">
                  <span>Table</span>
                  <strong>{selectedOrder.table?.displayName ?? 'Counter'}</strong>
                </article>
                <article className="terminal-board-chip">
                  <span>Next</span>
                  <strong>{nextAction ? nextAction.label : 'No action'}</strong>
                </article>
              </div>

              <article className="sub-panel surface-panel">
                <div className="section-header">
                  <div>
                      <h3>Prep list</h3>
                      <p className="supporting-copy">
                        Items and modifiers to produce now.
                      </p>
                  </div>
                  <span className="status-pill neutral">
                    {selectedOrder.items.length} line{selectedOrder.items.length === 1 ? '' : 's'}
                  </span>
                </div>
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

              <div className="service-inspector__actions-grid">
                <article className="sub-panel surface-panel">
                  <div className="section-header">
                    <div>
                      <h3>Station tickets</h3>
                      <p className="supporting-copy">
                        Stations attached to this order.
                      </p>
                    </div>
                    <span className="status-pill neutral">
                      {selectedOrder.kitchenTickets.length} station{selectedOrder.kitchenTickets.length === 1 ? '' : 's'}
                    </span>
                  </div>
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
                  <div className="section-header">
                    <div>
                      <h3>Advance lane</h3>
                      <p className="supporting-copy">
                        Move this ticket to the next kitchen stage.
                      </p>
                    </div>
                    <span className="status-pill neutral">
                      {nextAction ? formatEnum(nextAction.status) : 'No action'}
                    </span>
                  </div>
                  <div className="support-inline-meta support-inline-meta--board">
                    <span>{selectedOrderTableLabel}</span>
                    <span>{describeStationsFromDetail(selectedOrder)}</span>
                  </div>
                  {nextAction ? (
                    <form className="form-grid service-control-form" onSubmit={submitKitchenAction}>
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
                      No kitchen action is available from this state.
                    </p>
                  )}
                </article>
              </div>
            </>
          )}
        </aside>
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

function kitchenStatusPriority(status: KitchenStatus) {
  switch (status) {
    case 'SENT_TO_KITCHEN':
      return 0;
    case 'PREPARING':
      return 1;
    case 'READY':
      return 2;
    default:
      return 99;
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

function describeStationsFromDetail(order: OrderDetail) {
  const labels = Array.from(
    new Set(
      order.kitchenTickets.map(
        (ticket) => ticket.station?.name ?? shortStationLabel(ticket.stationId),
      ),
    ),
  );

  if (labels.length === 0) {
    return 'No kitchen station assigned';
  }

  return labels.join(', ');
}

function shortStationLabel(stationId: string) {
  return `Station ${stationId.slice(0, 8)}`;
}
