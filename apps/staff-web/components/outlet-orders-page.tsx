'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import {
  cancelOrder,
  createAdminCheckout,
  getOrder,
  getOrders,
  updateOrderStatus,
  verifyManualPayNow,
} from '@/lib/api';
import type {
  CheckoutSessionResponse,
  OrderDetail,
  OrderListEntry,
  StaffOrderStatus,
} from '@/lib/types';
import {
  OutletHeader,
  OutletPageLayout,
  useOutletContext,
} from './outlet-page-base';

const statusFilters: Array<StaffOrderStatus | 'ALL'> = [
  'ALL',
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
  const [orders, setOrders] = useState<OrderListEntry[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [filter, setFilter] = useState<StaffOrderStatus | 'ALL'>('ALL');
  const [busy, setBusy] = useState(true);
  const [detailBusy, setDetailBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('Progressing service workflow.');
  const [actionBusy, setActionBusy] = useState(false);
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
        const result = await getOrders(authToken, outletId, filter);
        if (!cancelled) {
          setOrders(result);
          setSelectedOrderId((current) =>
            current && result.some((order) => order.id === current)
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
  }, [filter, outletId, session]);

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
  }, [outletId, selectedOrderId, session]);

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
    selectedOrder.status === 'PENDING_PAYMENT' &&
    (selectedOrder.source === 'POS' || selectedOrder.source === 'WAITER');
  const supportsCancellation =
    !!selectedOrder &&
    (selectedOrder.status === 'PENDING_PAYMENT' ||
      selectedOrder.status === 'PAYMENT_PROCESSING');

  useEffect(() => {
    setCheckoutResult(null);
    setManualReference('');
    setManualReason('Staff confirmed payment in the outlet.');
    setCancelReason('Staff voided this order before kitchen release.');
  }, [selectedOrderId]);

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
          successUrl: `${window.location.origin}/outlets/${outletId}/orders`,
          cancelUrl: `${window.location.origin}/outlets/${outletId}/orders`,
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

      <section className="operations-layout">
        <div className="panel section-panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">Queue filter</p>
              <h2 className="section-title serif">Current order board</h2>
            </div>
            <select
              className="filter-select"
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
          ) : (
            <div className="order-list">
              {orders.map((order) => (
                <button
                  className={
                    selectedOrderId === order.id
                      ? 'order-list-item current'
                      : 'order-list-item'
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
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="panel section-panel detail-panel">
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
                <span
                  className={`status-pill ${statusTone(selectedOrder.status)}`}
                >
                  {formatEnum(selectedOrder.status)}
                </span>
              </div>

              <div className="detail-grid">
                <article className="sub-panel">
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

                <article className="sub-panel">
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

              <article className="sub-panel">
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

              <article className="sub-panel">
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

              <article className="sub-panel">
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

              <article className="sub-panel">
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

              <article className="sub-panel">
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
