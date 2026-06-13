'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  FormEvent,
  MouseEvent,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  cancelOrder,
  createAdminCheckout,
  getOrder,
  getOrders,
  updateOrderStatus,
  verifyManualPayNow,
} from '@/lib/api';
import { createOperationsSocket, outletOperationsEvents } from '@/lib/realtime';
import type {
  CheckoutSessionResponse,
  OrderDetail,
  OrderListEntry,
  RealtimeStatus,
  StaffOrderStatus,
} from '@/lib/types';
import {
  OutletHeader,
  OutletPageLayout,
  useOutletContext,
} from './outlet-page-base';

const actionableStatuses: StaffOrderStatus[] = [
  'PENDING_PAYMENT',
  'PAYMENT_PROCESSING',
  'SENT_TO_KITCHEN',
  'PREPARING',
  'READY',
];

const statusFilters: Array<StaffOrderStatus | 'ALL' | 'ACTIONABLE'> = [
  'ACTIONABLE',
  'ALL',
  'DRAFT',
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

type QueueMode = 'ACTION' | 'PAYMENTS' | 'OPEN' | 'ALL';
type OrderFilter = StaffOrderStatus | 'ALL' | 'ACTIONABLE';

export function OutletOrdersPage() {
  const {
    session,
    outlet,
    outletId,
    error: outletError,
    busy: outletBusy,
  } = useOutletContext();
  const searchParams = useSearchParams();
  const requestedOrderId = searchParams.get('orderId');
  const requestedTableId = searchParams.get('tableId');
  const [orders, setOrders] = useState<OrderListEntry[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [filter, setFilter] = useState<OrderFilter>(
    requestedTableId ? 'ALL' : 'ACTIONABLE',
  );
  const [queueMode, setQueueMode] = useState<QueueMode>(
    requestedTableId ? 'ALL' : 'ACTION',
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [busy, setBusy] = useState(true);
  const [detailBusy, setDetailBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('Progressing service workflow.');
  const [actionBusy, setActionBusy] = useState(false);
  const [quickActionOrderId, setQuickActionOrderId] = useState<string | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [checkoutResult, setCheckoutResult] =
    useState<CheckoutSessionResponse | null>(null);
  const [manualReference, setManualReference] = useState('');
  const [manualReason, setManualReason] = useState(
    'Staff confirmed payment in the outlet.',
  );
  const [cancelReason, setCancelReason] = useState(
    'Staff voided this order before kitchen release.',
  );
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
        const result = await getOrders(
          authToken,
          outletId,
          filter === 'ACTIONABLE' ? 'ALL' : filter,
          requestedTableId ?? undefined,
        );
        if (!cancelled) {
          setOrders(result);
          setSelectedOrderId((current) =>
            requestedOrderId && result.some((order) => order.id === requestedOrderId)
              ? requestedOrderId
              : current && result.some((order) => order.id === current)
                ? current
                : (result[0]?.id ?? null),
          );
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Orders failed to load.',
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
  }, [filter, outletId, refreshTick, requestedOrderId, requestedTableId, session]);

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
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Order detail failed to load.',
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

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const tableFocusedOrders = requestedTableId ? orders : orders;
  const filteredOrders = useMemo(
    () =>
      orders
        .filter((order) => {
          if (filter === 'ACTIONABLE' && !actionableStatuses.includes(order.status)) {
            return false;
          }
          if (filter !== 'ALL' && filter !== 'ACTIONABLE' && order.status !== filter) {
            return false;
          }
          if (queueMode === 'ACTION' && !nextStatusAction(order.status)) {
            return false;
          }
          if (
            queueMode === 'PAYMENTS' &&
            order.status !== 'PENDING_PAYMENT' &&
            order.status !== 'PAYMENT_PROCESSING'
          ) {
            return false;
          }
          if (
            queueMode === 'OPEN' &&
            ['COMPLETED', 'CANCELLED'].includes(order.status)
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
            order.paymentStatus,
            order.status,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

          return haystack.includes(normalizedSearch);
        })
        .sort((left, right) => {
          const priorityDelta =
            servicePriority(left.status, left.paymentStatus) -
            servicePriority(right.status, right.paymentStatus);
          if (priorityDelta !== 0) {
            return priorityDelta;
          }
          return (
            new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
          );
        }),
    [filter, normalizedSearch, orders, queueMode],
  );
  const focusedTable = tableFocusedOrders[0]?.table ?? null;

  useEffect(() => {
    if (requestedTableId) {
      setQueueMode('ALL');
    }
  }, [requestedTableId]);

  useEffect(() => {
    setSelectedOrderId((current) =>
      requestedOrderId && filteredOrders.some((order) => order.id === requestedOrderId)
        ? requestedOrderId
        : current && filteredOrders.some((order) => order.id === current)
          ? current
          : (filteredOrders[0]?.id ?? null),
    );
  }, [filteredOrders, requestedOrderId]);

  const nextAction = selectedOrder
    ? nextStatusAction(selectedOrder.status)
    : null;
  const currentPayment = selectedOrder?.payments[0] ?? null;
  const supportsOnlineCheckout =
    currentPayment?.provider === 'HITPAY' &&
    currentPayment.method === 'ONLINE_CARD' &&
    !!selectedOrder &&
    ['PENDING_PAYMENT', 'PAYMENT_PROCESSING'].includes(selectedOrder.status);
  const supportsManualVerification =
    currentPayment?.method === 'MANUAL_PAYNOW' &&
    currentPayment.status === 'MANUAL_VERIFICATION_REQUIRED' &&
    selectedOrder?.status === 'PENDING_PAYMENT';
  const supportsAmendment =
    !!selectedOrder &&
    (selectedOrder.status === 'PENDING_PAYMENT' ||
      selectedOrder.status === 'DRAFT') &&
    (selectedOrder.source === 'POS' || selectedOrder.source === 'WAITER');
  const supportsCancellation =
    !!selectedOrder &&
    (selectedOrder.status === 'DRAFT' ||
      selectedOrder.status === 'PENDING_PAYMENT' ||
      selectedOrder.status === 'PAYMENT_PROCESSING');
  const liveQueueCount = filteredOrders.length;
  const actionNowCount = filteredOrders.filter((order) =>
    Boolean(nextStatusAction(order.status)),
  ).length;
  const paymentAttentionCount = orders.filter(
    (order) =>
      order.status === 'PENDING_PAYMENT' ||
      order.status === 'PAYMENT_PROCESSING',
  ).length;
  const draftCount = orders.filter((order) => order.status === 'DRAFT').length;
  const leadVisibleOrder = filteredOrders[0] ?? null;
  const selectedOrderTableLabel = selectedOrder?.table
    ? `${selectedOrder.table.zone?.name ?? 'No zone'} | ${selectedOrder.table.displayName}`
    : 'Counter / no table';
  const selectedOrderGuestLabel =
    selectedOrder?.customerName ?? selectedOrder?.customerPhone ?? 'Walk-in / guest';

  useEffect(() => {
    setCheckoutResult(null);
    setManualReference('');
    setManualReason('Staff confirmed payment in the outlet.');
    setCancelReason('Staff voided this order before kitchen release.');
  }, [selectedOrderId]);

  async function handleQuickAdvance(
    event: MouseEvent<HTMLButtonElement>,
    order: OrderListEntry,
  ) {
    event.stopPropagation();
    const nextAction = nextStatusAction(order.status);
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
          reason: defaultReasonForStatus(order.status),
        },
      );

      setOrders((current) =>
        current.map((entry) =>
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
                payments: updated.payments.map((payment) => ({
                  method: payment.method,
                  status: payment.status,
                })),
              }
            : entry,
        ),
      );

      if (selectedOrderId === updated.id) {
        setSelectedOrder(updated);
        setReason(defaultReasonForStatus(updated.status));
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Status update failed.',
      );
    } finally {
      setQuickActionOrderId(null);
    }
  }

  async function submitNextStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session?.accessToken || !selectedOrder || !nextAction || !outletId) {
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
      setOrders((current) =>
        current.map((order) =>
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
        ),
      );
      setReason(defaultReasonForStatus(updated.status));
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Status update failed.',
      );
    } finally {
      setActionBusy(false);
    }
  }

  async function handleCreateCheckout() {
    if (!session?.accessToken || !selectedOrder || !outletId) {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }

    setCheckoutBusy(true);
    setError(null);
    setCheckoutResult(null);

    try {
      const checkout = await createAdminCheckout(
        session.accessToken,
        outletId,
        selectedOrder.id,
        createIdempotencyKey(),
        {
          paymentMethod: 'ONLINE_CARD',
          successUrl: resolvePublicPaymentStatusUrl('success'),
          cancelUrl: resolvePublicPaymentStatusUrl('cancelled'),
        },
      );
      setCheckoutResult(checkout);
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : 'Failed to create HitPay checkout.',
      );
    } finally {
      setCheckoutBusy(false);
    }
  }

  async function handleVerifyManualPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session?.accessToken || !selectedOrder || !outletId) {
      return;
    }

    setManualBusy(true);
    setError(null);
    setCheckoutResult(null);

    try {
      const updated = await verifyManualPayNow(
        session.accessToken,
        outletId,
        selectedOrder.id,
        createIdempotencyKey(),
        {
          amountCents: selectedOrder.grandTotalCents,
          reference: manualReference.trim(),
          reason: manualReason.trim(),
        },
      );

      setSelectedOrder(updated);
      setOrders((current) =>
        current.map((order) =>
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
                payments: updated.payments.map((payment) => ({
                  method: payment.method,
                  status: payment.status,
                })),
              }
            : order,
        ),
      );
      setManualReference('');
    } catch (verificationError) {
      setError(
        verificationError instanceof Error
          ? verificationError.message
          : 'Failed to verify manual payment.',
      );
    } finally {
      setManualBusy(false);
    }
  }

  async function handleCancelOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session?.accessToken || !selectedOrder || !outletId) {
      return;
    }

    setCancelBusy(true);
    setError(null);
    setCheckoutResult(null);

    try {
      const updated = await cancelOrder(
        session.accessToken,
        outletId,
        selectedOrder.id,
        {
          reason: cancelReason.trim(),
        },
      );

      setSelectedOrder(updated);
      setOrders((current) =>
        current.map((order) =>
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
                payments: updated.payments.map((payment) => ({
                  method: payment.method,
                  status: payment.status,
                })),
              }
            : order,
        ),
      );
    } catch (cancelError) {
      setError(
        cancelError instanceof Error
          ? cancelError.message
          : 'Failed to cancel the order.',
      );
    } finally {
      setCancelBusy(false);
    }
  }

  return (
    <OutletPageLayout
      title="Orders"
      subtitle="Run the service queue, payment rescue, and handoff from one operator lane."
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

      <section className="operations-layout service-board-layout">
        <aside className="panel section-panel queue-card--upgraded service-queue-rail">
          <div className="section-header">
            <div>
              <p className="eyebrow">Service queue</p>
              <h2 className="section-title">Action queue</h2>
              <p className="supporting-copy">
                Payments, active service, and follow-up tickets in one rail.
              </p>
            </div>
            <div className="inline-actions">
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
              {requestedTableId ? (
                <Link className="secondary-button" href={`/outlets/${outletId}/orders`}>
                  Clear table focus
                </Link>
              ) : null}
            </div>
          </div>

          <div className="support-inline-meta support-inline-meta--board">
            <span>
              {requestedTableId && focusedTable
                ? `Focused on ${focusedTable.displayName} (${focusedTable.tableCode})`
                : `${filteredOrders.length} tickets in view`}
            </span>
            <span>
              {leadVisibleOrder
                ? `Lead ticket #${leadVisibleOrder.orderNumber}`
                : 'No active selection'}
            </span>
          </div>

          <div className="queue-scope-bar">
            <button
              className={queueMode === 'ACTION' ? 'queue-scope-chip active' : 'queue-scope-chip'}
              onClick={() => setQueueMode('ACTION')}
              type="button"
            >
              Action
              <small>{actionNowCount} tickets</small>
            </button>
            <button
              className={queueMode === 'PAYMENTS' ? 'queue-scope-chip active' : 'queue-scope-chip'}
              onClick={() => setQueueMode('PAYMENTS')}
              type="button"
            >
              Payments
              <small>{paymentAttentionCount} tickets</small>
            </button>
            <button
              className={queueMode === 'OPEN' ? 'queue-scope-chip active' : 'queue-scope-chip'}
              onClick={() => setQueueMode('OPEN')}
              type="button"
            >
              Open tickets
              <small>{orders.filter((order) => !['COMPLETED', 'CANCELLED'].includes(order.status)).length}</small>
            </button>
            <button
              className={queueMode === 'ALL' ? 'queue-scope-chip active' : 'queue-scope-chip'}
              onClick={() => setQueueMode('ALL')}
              type="button"
            >
              All records
              <small>{orders.length} total</small>
            </button>
          </div>

          <div className="form-grid service-board-filters">
            <div className="field">
              <label htmlFor="orders-search">Find an order</label>
              <input
                id="orders-search"
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by order, guest, table, phone, or status"
                value={searchTerm}
              />
            </div>
            <div className="field">
              <label htmlFor="orders-status-filter">Status filter</label>
              <select
                className="filter-select"
                id="orders-status-filter"
                onChange={(event) =>
                    setFilter(event.target.value as OrderFilter)
                }
                value={filter}
              >
                {statusFilters.map((item) => (
                  <option key={item} value={item}>
                    {item === 'ACTIONABLE'
                      ? 'Actionable now'
                      : item === 'ALL'
                        ? 'All statuses'
                        : formatEnum(item)}
                  </option>
                ))}
              </select>
            </div>
            <div className="service-board-filters__actions">
              {(searchTerm || filter !== (requestedTableId ? 'ALL' : 'ACTIONABLE') || requestedTableId) ? (
                <>
                  {(searchTerm || filter !== (requestedTableId ? 'ALL' : 'ACTIONABLE')) && (
                    <button
                      className="ghost-button"
                      onClick={() => {
                        setSearchTerm('');
                        setFilter(requestedTableId ? 'ALL' : 'ACTIONABLE');
                      }}
                      type="button"
                >
                  Clear filters
                </button>
              )}
                  {queueMode !== 'ACTION' && !requestedTableId ? (
                    <button
                      className="ghost-button"
                      onClick={() => setQueueMode('ACTION')}
                      type="button"
                    >
                      Back to action lane
                    </button>
                  ) : null}
                  {requestedTableId ? (
                    <Link className="secondary-button" href={`/outlets/${outletId}/orders`}>
                      Leave table focus
                    </Link>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>

          <div className="terminal-board-strip service-queue-metrics">
            <article className="terminal-board-chip">
              <span>Visible</span>
              <strong>{liveQueueCount}</strong>
            </article>
            <article className="terminal-board-chip">
              <span>Action now</span>
              <strong>{actionNowCount}</strong>
            </article>
            <article className="terminal-board-chip">
              <span>Payments</span>
              <strong>{paymentAttentionCount}</strong>
            </article>
            <article className="terminal-board-chip">
              <span>Drafts</span>
              <strong>{draftCount}</strong>
            </article>
          </div>

          {busy ? (
            <p className="supporting-copy">Loading orders...</p>
          ) : orders.length === 0 ? (
            <div className="empty-state">
              <h3>No orders in this view</h3>
              <p className="supporting-copy">
                Try a broader filter or wait for the next QR checkout to land in
                the outlet queue.
              </p>
            </div>
          ) : requestedTableId && tableFocusedOrders.length === 0 ? (
            <div className="empty-state">
              <h3>No live orders for this table</h3>
              <p className="supporting-copy">
                This table does not have matching tickets in the current outlet queue yet.
              </p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="empty-state">
              <h3>No matching orders</h3>
              <p className="supporting-copy">
                Clear the search or broaden the status filter to bring orders back
                into view.
              </p>
            </div>
          ) : (
            <div className="service-ticket-list service-ticket-list--grid">
              {filteredOrders.map((order) => (
                <article
                  className={
                    selectedOrderId === order.id
                      ? 'service-ticket-card active'
                      : 'service-ticket-card'
                  }
                  key={order.id}
                >
                  <button
                    className="service-ticket-card__select"
                    onClick={() => {
                      setSelectedOrderId(order.id);
                      setReason(defaultReasonForStatus(order.status));
                    }}
                    type="button"
                  >
                    <div className="service-ticket-card__topline">
                      <span className="mini-badge">
                        {order.table?.tableCode ?? 'COUNTER'}
                      </span>
                      <span className="service-ticket-card__age">
                        {formatRelativeTime(order.updatedAt)}
                      </span>
                    </div>
                    <div className="service-ticket-card__header">
                      <div>
                        <strong>#{order.orderNumber}</strong>
                        <p className="supporting-copy">
                          {order.table?.displayName ?? 'Counter'} |{' '}
                          {order.customerName ?? 'Walk-in / guest'}
                        </p>
                      </div>
                      <div className="service-ticket-card__badges">
                        <span className={`status-pill ${statusTone(order.status)}`}>
                          {formatEnum(order.status)}
                        </span>
                        <span
                          className={`mini-badge mini-badge--${paymentAttentionTone(order.paymentStatus)}`}
                        >
                          {formatEnum(order.paymentStatus)}
                        </span>
                      </div>
                    </div>

                    <div className="service-ticket-card__metrics">
                      <div className="metric-inline">
                        <span>Total</span>
                        <strong>
                          {formatMoney(order.currency, order.grandTotalCents)}
                        </strong>
                      </div>
                      <div className="metric-inline">
                        <span>Payment</span>
                        <strong>{compactPaymentStatus(order.paymentStatus)}</strong>
                      </div>
                      <div className="metric-inline">
                        <span>Next</span>
                        <strong>
                          {nextStatusAction(order.status)?.label ?? 'No action'}
                        </strong>
                      </div>
                    </div>

                    <div className="service-ticket-card__footer">
                      <span>
                        {order.customerPhone ?? 'Walk-in / no phone'}
                      </span>
                      {selectedOrderId === order.id ? (
                        <span className="mini-badge mini-badge--info">Selected</span>
                      ) : null}
                    </div>
                  </button>
                  {nextStatusAction(order.status) ? (
                    <div className="service-ticket-card__rail">
                      <button
                        className="secondary-button"
                        disabled={quickActionOrderId === order.id}
                        onClick={(event) => void handleQuickAdvance(event, order)}
                        type="button"
                      >
                        {quickActionOrderId === order.id
                          ? 'Updating...'
                          : nextStatusAction(order.status)?.label}
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </aside>

        <section className="panel section-panel detail-panel detail-panel--upgraded service-inspector">
          {detailBusy ? (
            <p className="supporting-copy">Loading order detail...</p>
          ) : !selectedOrder ? (
            <div className="empty-state">
              <h3>Select an order</h3>
              <p className="supporting-copy">
                The detail panel will show items, payment state, and the next
                service action.
              </p>
            </div>
          ) : (
            <>
              <div className="service-inspector__hero service-inspector__hero--split">
                <div className="service-inspector__identity">
                  <p className="eyebrow">Selected ticket</p>
                  <h2 className="section-title">#{selectedOrder.orderNumber}</h2>
                </div>
                <div className="service-inspector__actions">
                  {supportsAmendment ? (
                    <Link
                      className="primary-button"
                      href={`/outlets/${outletId}/pos?orderId=${selectedOrder.id}`}
                    >
                      Edit in POS
                    </Link>
                  ) : null}
                  <Link
                    className="secondary-button"
                    href={`/outlets/${outletId}/orders/${selectedOrder.id}`}
                  >
                    Full detail
                  </Link>
                  <span
                    className={`status-pill ${statusTone(selectedOrder.status)}`}
                  >
                    {formatEnum(selectedOrder.status)}
                  </span>
                </div>
              </div>
              <div className="support-inline-meta support-inline-meta--board service-inspector__meta-bar">
                <span>{selectedOrderTableLabel}</span>
                <span>{selectedOrderGuestLabel}</span>
                <span>{new Date(selectedOrder.createdAt).toLocaleString()}</span>
              </div>

              <div className="terminal-board-strip service-inspector__summary-strip service-inspector__summary-strip--orders">
                <article className="terminal-board-chip">
                  <span>Total</span>
                  <strong>
                    {formatMoney(
                      selectedOrder.currency,
                      selectedOrder.grandTotalCents,
                    )}
                  </strong>
                </article>
                <article className="terminal-board-chip">
                  <span>Payment</span>
                  <strong>{compactPaymentStatus(selectedOrder.paymentStatus)}</strong>
                </article>
                <article className="terminal-board-chip">
                  <span>Kitchen</span>
                  <strong>
                    {selectedOrder.kitchenTickets.length} ticket{selectedOrder.kitchenTickets.length === 1 ? '' : 's'}
                  </strong>
                </article>
                <article className="terminal-board-chip">
                  <span>Next</span>
                  <strong>{nextAction ? nextAction.label : 'No action'}</strong>
                </article>
              </div>

              <div className="detail-grid service-inspector__details service-inspector__details--orders">
                <article className="sub-panel surface-panel">
                  <div className="section-header">
                    <div>
                      <h3>Items on ticket</h3>
                      <p className="supporting-copy">
                        Ordered items, modifiers, and remarks.
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
                          {item.remarks ? (
                            <p className="supporting-copy">
                              Note: {item.remarks}
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
                        </div>
                        <strong>
                          {formatMoney(
                            selectedOrder.currency,
                            item.lineTotalCents,
                          )}
                        </strong>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="sub-panel surface-panel">
                  <div className="section-header">
                    <div>
                      <h3>Payments and kitchen</h3>
                      <p className="supporting-copy">
                        Payment records and kitchen releases for this ticket.
                      </p>
                    </div>
                    <span className="status-pill neutral">
                      {selectedOrder.payments.length + selectedOrder.kitchenTickets.length} records
                    </span>
                  </div>
                  <div className="stack-list">
                    {selectedOrder.payments.map((payment) => (
                      <div className="stack-row" key={payment.id}>
                        <div>
                          <strong>
                            {formatEnum(payment.method)}
                          </strong>
                          <p className="supporting-copy">
                            {formatEnum(payment.status)}
                          </p>
                          {payment.manualReference ? (
                            <p className="supporting-copy">
                              Reference: {payment.manualReference}
                            </p>
                          ) : null}
                        </div>
                        <strong>
                          {formatMoney(
                            selectedOrder.currency,
                            payment.amountCents,
                          )}
                        </strong>
                      </div>
                    ))}
                    {selectedOrder.kitchenTickets.map((ticket) => (
                      <div className="stack-row" key={ticket.id}>
                        <div>
                          <strong>
                            {ticket.station?.name ?? 'Kitchen station'}
                          </strong>
                          <p className="supporting-copy">
                            Ticket {ticket.id.slice(0, 8)}
                          </p>
                        </div>
                        <span
                          className={`status-pill ${statusTone(ticket.status)}`}
                        >
                          {formatEnum(ticket.status)}
                        </span>
                      </div>
                    ))}
                  </div>
                </article>
              </div>

              <div className="service-inspector__actions-grid service-inspector__actions-grid--orders">
                <article className="sub-panel surface-panel service-action-panel service-action-panel--primary">
                  <div className="section-header">
                    <div>
                      <h3>Next service action</h3>
                      <p className="supporting-copy">
                        Push the ticket to the next service stage.
                      </p>
                    </div>
                    <span className="status-pill neutral">
                      {nextAction ? formatEnum(nextAction.status) : 'Complete'}
                    </span>
                  </div>
                  <div className="support-inline-meta support-inline-meta--board">
                    <span>{selectedOrderTableLabel}</span>
                    <span>{selectedOrderGuestLabel}</span>
                  </div>
                  {nextAction ? (
                    <form className="form-grid service-control-form" onSubmit={submitNextStatus}>
                      <div className="field">
                        <label htmlFor="reason">Reason</label>
                        <textarea
                          id="reason"
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
                      No staff status transition is available from the current
                      state.
                    </p>
                  )}
                </article>

                <article className="sub-panel surface-panel service-action-panel">
                  <div className="section-header">
                    <div>
                      <h3>Payment action</h3>
                      <p className="supporting-copy">
                        Reopen checkout or confirm manual settlement.
                      </p>
                    </div>
                    <span className="status-pill neutral">
                      {formatEnum(selectedOrder.paymentStatus)}
                    </span>
                  </div>
                  <div className="support-inline-meta support-inline-meta--board">
                    <span>
                      {currentPayment
                        ? formatEnum(currentPayment.method)
                        : 'No payment record yet'}
                    </span>
                    <span>{formatMoney(selectedOrder.currency, selectedOrder.grandTotalCents)}</span>
                  </div>
                  {supportsOnlineCheckout ? (
                    <div className="form-grid service-control-form">
                      <button
                        className="primary-button"
                        disabled={checkoutBusy}
                        onClick={() => void handleCreateCheckout()}
                        type="button"
                      >
                        {checkoutBusy ? 'Creating checkout...' : 'Create checkout'}
                      </button>
                      {checkoutResult?.checkoutUrl ? (
                        <a
                          className="secondary-button"
                          href={checkoutResult.checkoutUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Open checkout
                        </a>
                      ) : null}
                    </div>
                  ) : supportsManualVerification ? (
                    <form className="form-grid service-control-form" onSubmit={handleVerifyManualPayment}>
                      <div className="field">
                        <label htmlFor="manual-amount">Verified amount</label>
                        <input
                          id="manual-amount"
                          readOnly
                          value={formatMoney(
                            selectedOrder.currency,
                            selectedOrder.grandTotalCents,
                          )}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="manual-reference">Reference</label>
                        <input
                          id="manual-reference"
                          onChange={(event) => setManualReference(event.target.value)}
                          placeholder="Transfer or receipt reference"
                          value={manualReference}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="manual-reason">Reason</label>
                        <textarea
                          id="manual-reason"
                          onChange={(event) => setManualReason(event.target.value)}
                          rows={3}
                          value={manualReason}
                        />
                      </div>
                      <button
                        className="primary-button"
                        disabled={
                          manualBusy ||
                          manualReference.trim().length < 2 ||
                          manualReason.trim().length < 3
                        }
                        type="submit"
                      >
                        {manualBusy ? 'Verifying...' : 'Confirm manual payment'}
                      </button>
                    </form>
                  ) : (
                    <p className="supporting-copy">
                      No payment recovery is needed right now.
                    </p>
                  )}
                </article>

                <article className="sub-panel surface-panel service-action-panel">
                  <div className="section-header">
                    <div>
                      <h3>Order changes</h3>
                      <p className="supporting-copy">
                        Edit in POS, or void before kitchen release.
                      </p>
                    </div>
                    <span className="status-pill neutral">
                      {supportsCancellation ? 'Void available' : 'Read only'}
                    </span>
                  </div>
                  <div className="stack-list">
                    {!supportsAmendment ? (
                      <p className="supporting-copy">
                        This ticket can no longer be amended in POS.
                      </p>
                    ) : null}

                    {supportsCancellation ? (
                      <form className="form-grid" onSubmit={handleCancelOrder}>
                        <div className="field">
                          <label htmlFor="cancel-reason">Void reason</label>
                          <textarea
                            id="cancel-reason"
                            onChange={(event) => setCancelReason(event.target.value)}
                            rows={3}
                            value={cancelReason}
                          />
                        </div>
                        <button
                          className="secondary-button"
                          disabled={cancelBusy || cancelReason.trim().length < 3}
                          type="submit"
                        >
                          {cancelBusy ? 'Voiding...' : 'Void unpaid order'}
                        </button>
                      </form>
                    ) : (
                      <p className="supporting-copy">
                        Void is only available before kitchen release.
                      </p>
                    )}
                  </div>
                </article>

                <article className="sub-panel surface-panel service-action-panel">
                  <div className="section-header">
                    <div>
                      <h3>Final totals</h3>
                      <p className="supporting-copy">
                        Final backend-confirmed charges.
                      </p>
                    </div>
                    <span className="status-pill neutral">
                      {selectedOrder.currency}
                    </span>
                  </div>
                  <div className="queue-metrics service-bill-grid">
                    <div className="metric-inline">
                      <span>Subtotal</span>
                      <strong>
                        {formatMoney(
                          selectedOrder.currency,
                          selectedOrder.subtotalCents,
                        )}
                      </strong>
                    </div>
                    <div className="metric-inline">
                      <span>Service</span>
                      <strong>
                        {formatMoney(
                          selectedOrder.currency,
                          selectedOrder.serviceChargeTotalCents,
                        )}
                      </strong>
                    </div>
                    <div className="metric-inline">
                      <span>GST</span>
                      <strong>
                        {formatMoney(
                          selectedOrder.currency,
                          selectedOrder.gstTotalCents,
                        )}
                      </strong>
                    </div>
                    <div className="metric-inline">
                      <span>Total</span>
                      <strong>
                        {formatMoney(
                          selectedOrder.currency,
                          selectedOrder.grandTotalCents,
                        )}
                      </strong>
                    </div>
                  </div>
                </article>
              </div>

            </>
          )}
        </section>
      </section>
    </OutletPageLayout>
  );
}

function nextStatusAction(status: StaffOrderStatus) {
  switch (status) {
    case 'SENT_TO_KITCHEN':
      return { status: 'PREPARING' as const, label: 'Start preparing' };
    case 'PREPARING':
      return { status: 'READY' as const, label: 'Mark ready for pickup' };
    case 'READY':
      return { status: 'SERVED' as const, label: 'Mark served' };
    case 'SERVED':
      return { status: 'COMPLETED' as const, label: 'Complete order' };
    default:
      return null;
  }
}

function defaultReasonForStatus(status: StaffOrderStatus) {
  const action = nextStatusAction(status);
  if (!action) {
    return 'Progressing service workflow.';
  }
  return `Staff updated order to ${action.status.toLowerCase().replace('_', ' ')}.`;
}

function servicePriority(status: string, paymentStatus: string) {
  if (status === 'PAYMENT_PROCESSING' || paymentStatus === 'PROCESSING') {
    return 0;
  }
  if (status === 'PENDING_PAYMENT' || paymentStatus === 'PENDING') {
    return 1;
  }
  if (status === 'READY') {
    return 2;
  }
  if (status === 'PREPARING') {
    return 3;
  }
  if (status === 'SENT_TO_KITCHEN') {
    return 4;
  }
  if (status === 'DRAFT') {
    return 5;
  }
  if (status === 'SERVED') {
    return 6;
  }
  if (status === 'PAID') {
    return 7;
  }
  if (status === 'COMPLETED') {
    return 8;
  }
  if (status === 'CANCELLED') {
    return 9;
  }
  return 10;
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

function createIdempotencyKey() {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `staff-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function resolvePublicPaymentStatusUrl(state: 'success' | 'cancelled') {
  const configuredBase =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1';
  const normalizedBase = configuredBase.replace(/\/$/, '');
  const apiBase = normalizedBase.endsWith('/api/v1')
    ? normalizedBase
    : `${normalizedBase}/api/v1`;
  return `${apiBase}/public/payment-${state}`;
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

function paymentAttentionTone(status: string) {
  if (status === 'PAID') {
    return 'success';
  }
  if (
    status === 'MANUAL_VERIFICATION_REQUIRED' ||
    status === 'PENDING' ||
    status === 'PROCESSING'
  ) {
    return 'warning';
  }
  if (status === 'FAILED' || status === 'CANCELLED') {
    return 'danger';
  }
  return 'neutral';
}

function compactPaymentStatus(status: string) {
  switch (status) {
    case 'PAID':
      return 'Paid';
    case 'PENDING':
      return 'Pending';
    case 'PROCESSING':
      return 'Processing';
    case 'MANUAL_VERIFICATION_REQUIRED':
      return 'Verify';
    case 'FAILED':
      return 'Failed';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return formatEnum(status);
  }
}
