'use client';

import { FormEvent, useEffect, useEffectEvent, useRef, useState } from 'react';
import { getOrder, getOrders, updateOrderStatus } from '@/lib/api';
import { createOperationsSocket, outletOperationsEvents } from '@/lib/realtime';
import type { OrderDetail, OrderListEntry, RealtimeStatus } from '@/lib/types';
import {
  OutletHeader,
  OutletPageLayout,
  useOutletContext,
} from './outlet-page-base';

const kitchenStatuses = ['SENT_TO_KITCHEN', 'PREPARING', 'READY'] as const;

type KitchenStatus = (typeof kitchenStatuses)[number];

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
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('Kitchen updated the ticket status.');
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

  const groupedOrders = kitchenStatuses.map((status) => ({
    status,
    orders: orders.filter((order) => order.status === status),
  }));
  const nextAction = selectedOrder ? nextKitchenAction(selectedOrder.status) : null;

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
      </section>

      <section className="operations-layout">
        <div className="panel section-panel">
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

          {busy ? (
            <p className="supporting-copy">Loading kitchen queue...</p>
          ) : orders.length === 0 ? (
            <div className="empty-state">
              <h3>No active kitchen tickets</h3>
              <p className="supporting-copy">
                The queue will populate as new paid orders are released to the
                kitchen.
              </p>
            </div>
          ) : (
            <div className="operations-grid">
              {groupedOrders.map((entry) => (
                <article className="sub-panel" key={entry.status}>
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
                              ? 'order-list-item current'
                              : 'order-list-item'
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
                            </div>
                            <span className={`status-pill ${statusTone(order.status)}`}>
                              {formatEnum(order.status)}
                            </span>
                          </div>
                          <div className="queue-metrics">
                            <div className="metric-inline">
                              <span>Items</span>
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
                        </button>
                      ))
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="panel section-panel detail-panel">
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
                <span className={`status-pill ${statusTone(selectedOrder.status)}`}>
                  {formatEnum(selectedOrder.status)}
                </span>
              </div>

              <article className="sub-panel">
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

              <article className="sub-panel">
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

              <article className="sub-panel">
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
