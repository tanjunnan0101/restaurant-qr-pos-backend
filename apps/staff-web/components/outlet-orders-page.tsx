'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  FormEvent,
  MouseEvent,
  useEffect,
  useEffectEvent,
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

const statusFilters: Array<StaffOrderStatus | 'ALL'> = [
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
  const [filter, setFilter] = useState<StaffOrderStatus | 'ALL'>('ALL');
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
          filter,
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
  }, [filter, outletId, refreshTick, requestedOrderId, session]);

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
  const filteredOrders = orders.filter((order) => {
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
  });
  const focusedTable = tableFocusedOrders[0]?.table ?? null;

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
      title="Live orders"
      subtitle="Monitor the service queue and advance orders through the outlet workflow."
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
            <p className="eyebrow">Service flow</p>
            <h2 className="section-title serif">Keep the queue moving</h2>
            <p className="supporting-copy">
              Track live checkout outcomes, catch anything stuck between payment
              and service, and move the floor forward with fewer clicks.
            </p>
          </div>
          <div className="workspace-pill-grid">
            <div className="workspace-pill current">
              <span>Realtime</span>
              <strong>{formatRealtimeStatus(realtimeStatus)}</strong>
            </div>
            <div className="workspace-pill">
              <span>Focus</span>
              <strong>
                {focusedTable
                  ? `${focusedTable.displayName} (${focusedTable.tableCode})`
                  : 'All outlet tickets'}
              </strong>
            </div>
          </div>
        </div>
        <div className="operations-summary-grid">
          <article className="operations-summary-card">
            <span className="metric-label">Visible tickets</span>
            <strong>{liveQueueCount}</strong>
            <p className="supporting-copy">
              Orders currently in this search and status view.
            </p>
          </article>
          <article className="operations-summary-card">
            <span className="metric-label">Action now</span>
            <strong>{actionNowCount}</strong>
            <p className="supporting-copy">
              Tickets ready for the next service status change.
            </p>
          </article>
          <article className="operations-summary-card">
            <span className="metric-label">Payment attention</span>
            <strong>{paymentAttentionCount}</strong>
            <p className="supporting-copy">
              Orders waiting on payment completion or verification.
            </p>
          </article>
          <article className="operations-summary-card">
            <span className="metric-label">Held drafts</span>
            <strong>{draftCount}</strong>
            <p className="supporting-copy">
              Draft tickets still waiting to be resumed at service.
            </p>
          </article>
        </div>
      </section>

      <section className="operations-layout">
        <div className="panel section-panel queue-card--upgraded">
          <div className="section-header">
            <div>
              <p className="eyebrow">Queue filter</p>
            <h2 className="section-title serif">Current order board</h2>
            <p className="supporting-copy">
              Live sync: {formatRealtimeStatus(realtimeStatus)}
            </p>
            {focusedTable ? (
              <p className="supporting-copy">
                Focused on {focusedTable.displayName} ({focusedTable.tableCode}).
              </p>
            ) : null}
          </div>
          {requestedTableId ? (
            <Link className="secondary-button" href={`/outlets/${outletId}/orders`}>
              Clear table focus
            </Link>
          ) : null}
        </div>

          <div className="form-grid">
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
                  setFilter(event.target.value as StaffOrderStatus | 'ALL')
                }
                value={filter}
              >
                {statusFilters.map((item) => (
                  <option key={item} value={item}>
                    {item === 'ALL' ? 'All statuses' : formatEnum(item)}
                  </option>
                ))}
              </select>
            </div>
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
            <div className="order-list">
              {filteredOrders.map((order) => (
                <button
                  className={
                    selectedOrderId === order.id
                      ? 'order-list-item order-list-item--upgraded current'
                      : 'order-list-item order-list-item--upgraded'
                  }
                  key={order.id}
                  onClick={() => {
                    setSelectedOrderId(order.id);
                    setReason(defaultReasonForStatus(order.status));
                  }}
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
                      <span>Total</span>
                      <strong>
                        {formatMoney(order.currency, order.grandTotalCents)}
                      </strong>
                    </div>
                    <div className="metric-inline">
                      <span>Payment</span>
                      <strong>{formatEnum(order.paymentStatus)}</strong>
                    </div>
                    <div className="metric-inline">
                      <span>Kitchen tickets</span>
                      <strong>{order.kitchenTickets.length}</strong>
                    </div>
                  </div>
                  <div className="inline-actions">
                    {nextStatusAction(order.status) ? (
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
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="panel section-panel detail-panel detail-panel--upgraded">
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
              <div className="section-header">
                <div>
                  <p className="eyebrow">Order detail</p>
                  <h2 className="section-title serif">
                    #{selectedOrder.orderNumber}
                  </h2>
                  <p className="supporting-copy">
                    {selectedOrder.table?.zone?.name ?? 'No zone'} |{' '}
                    {selectedOrder.table?.displayName ?? 'No table'} |{' '}
                    {new Date(selectedOrder.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="inline-actions">
                  <Link
                    className="secondary-button"
                    href={`/outlets/${outletId}/orders/${selectedOrder.id}`}
                  >
                    Open detail URL
                  </Link>
                  <span
                    className={`status-pill ${statusTone(selectedOrder.status)}`}
                  >
                    {formatEnum(selectedOrder.status)}
                  </span>
                </div>
              </div>

              <div className="detail-grid">
                <article className="sub-panel surface-panel">
                  <h3>Items</h3>
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
                  <h3>Payments and tickets</h3>
                  <div className="stack-list">
                    {selectedOrder.payments.map((payment) => (
                      <div className="stack-row" key={payment.id}>
                        <div>
                          <strong>{formatEnum(payment.method)}</strong>
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

              <article className="sub-panel surface-panel">
                <h3>Edit unpaid order</h3>
                {supportsAmendment ? (
                  <div className="form-grid">
                    <p className="supporting-copy">
                      Reopen this unpaid POS or waiter order in the staff
                      composer to adjust items, guest details, table assignment,
                      or payment method before settlement continues.
                    </p>
                    <Link
                      className="primary-button"
                      href={`/outlets/${outletId}/pos?orderId=${selectedOrder.id}`}
                    >
                      Edit in POS
                    </Link>
                  </div>
                ) : (
                  <p className="supporting-copy">
                    Only unpaid staff-assisted orders can be amended here. Once
                    checkout is in progress or the order reaches kitchen flow,
                    use void and recreate instead.
                  </p>
                )}
              </article>

              <article className="sub-panel surface-panel">
                <h3>Payment actions</h3>
                {supportsOnlineCheckout ? (
                  <div className="form-grid">
                    <p className="supporting-copy">
                      Create or reopen a HitPay hosted checkout link for the
                      customer.
                    </p>
                    <button
                      className="primary-button"
                      disabled={checkoutBusy}
                      onClick={() => void handleCreateCheckout()}
                      type="button"
                    >
                      {checkoutBusy
                        ? 'Creating checkout...'
                        : 'Create HitPay checkout'}
                    </button>
                    {checkoutResult?.checkoutUrl ? (
                      <a
                        className="secondary-button"
                        href={checkoutResult.checkoutUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Open checkout page
                      </a>
                    ) : null}
                  </div>
                ) : supportsManualVerification ? (
                  <form
                    className="form-grid"
                    onSubmit={handleVerifyManualPayment}
                  >
                    <p className="supporting-copy">
                      Confirm the outlet has received the full manual payment
                      before the order proceeds to the kitchen.
                    </p>
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
                        onChange={(event) =>
                          setManualReference(event.target.value)
                        }
                        placeholder="Transfer or receipt reference"
                        value={manualReference}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="manual-reason">Reason</label>
                      <textarea
                        id="manual-reason"
                        onChange={(event) =>
                          setManualReason(event.target.value)
                        }
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
                    No payment action is needed right now. Paid orders can
                    continue through service, while unpaid orders must stay
                    aligned with their selected payment method.
                  </p>
                )}
              </article>

              <article className="sub-panel surface-panel">
                <h3>Void order</h3>
                {supportsCancellation ? (
                  <form className="form-grid" onSubmit={handleCancelOrder}>
                    <p className="supporting-copy">
                      Void this order before it reaches kitchen release. This
                      cancels the local order flow and prevents late checkout
                      callbacks from releasing it.
                    </p>
                    <div className="field">
                      <label htmlFor="cancel-reason">Reason</label>
                      <textarea
                        id="cancel-reason"
                        onChange={(event) =>
                          setCancelReason(event.target.value)
                        }
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
                    Only pre-kitchen orders that are still awaiting or
                    processing payment can be voided here.
                  </p>
                )}
              </article>

              <article className="sub-panel surface-panel">
                <h3>Bill summary</h3>
                <div className="queue-metrics">
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

              <article className="sub-panel surface-panel">
                <h3>Next service action</h3>
                {nextAction ? (
                  <form className="form-grid" onSubmit={submitNextStatus}>
                    <p className="supporting-copy">
                      This order can move to{' '}
                      <strong>{formatEnum(nextAction.status)}</strong>.
                    </p>
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
                    state. This usually means the order is waiting on payment,
                    already completed, or cancelled.
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
