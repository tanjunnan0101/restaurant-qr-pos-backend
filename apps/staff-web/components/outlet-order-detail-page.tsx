'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  cancelOrder,
  createAdminCheckout,
  getOrder,
  updateOrderStatus,
  verifyManualPayNow,
} from '@/lib/api';
import { createOperationsSocket, outletOperationsEvents } from '@/lib/realtime';
import type {
  CheckoutSessionResponse,
  OrderDetail,
  RealtimeStatus,
  StaffOrderStatus,
} from '@/lib/types';
import {
  OutletHeader,
  OutletPageLayout,
  useOutletContext,
} from './outlet-page-base';

export function OutletOrderDetailPage() {
  const params = useParams<{ orderId: string }>();
  const orderId = params.orderId;
  const {
    session,
    outlet,
    outletId,
    error: outletError,
    busy: outletBusy,
  } = useOutletContext();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [busy, setBusy] = useState(true);
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
    if (!session?.accessToken || !outletId || !orderId) {
      setOrder(null);
      return;
    }

    const authToken = session.accessToken;
    let cancelled = false;

    async function loadDetail() {
      setBusy(true);
      setError(null);
      try {
        const detail = await getOrder(authToken, outletId, orderId);
        if (!cancelled) {
          setOrder(detail);
          setReason(defaultReasonForStatus(detail.status));
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
          setBusy(false);
        }
      }
    }

    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [orderId, outletId, refreshTick, session]);

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

  const nextAction = order ? nextStatusAction(order.status) : null;
  const currentPayment = order?.payments[0] ?? null;
  const paidAt =
    order?.payments.find((payment) => payment.paidAt)?.paidAt ?? null;
  const supportsOnlineCheckout =
    currentPayment?.provider === 'HITPAY' &&
    currentPayment.method === 'ONLINE_CARD' &&
    !!order &&
    ['PENDING_PAYMENT', 'PAYMENT_PROCESSING'].includes(order.status);
  const supportsManualVerification =
    currentPayment?.method === 'MANUAL_PAYNOW' &&
    currentPayment.status === 'MANUAL_VERIFICATION_REQUIRED' &&
    order?.status === 'PENDING_PAYMENT';
  const supportsAmendment =
    !!order &&
    (order.status === 'PENDING_PAYMENT' || order.status === 'DRAFT') &&
    (order.source === 'POS' || order.source === 'WAITER');
  const supportsCancellation =
    !!order &&
    (order.status === 'DRAFT' ||
      order.status === 'PENDING_PAYMENT' ||
      order.status === 'PAYMENT_PROCESSING');

  async function submitNextStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session?.accessToken || !order || !nextAction || !outletId) {
      return;
    }

    setActionBusy(true);
    setError(null);
    try {
      const updated = await updateOrderStatus(
        session.accessToken,
        outletId,
        order.id,
        {
          status: nextAction.status,
          reason,
        },
      );
      setOrder(updated);
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
    if (!session?.accessToken || !order || !outletId) {
      return;
    }

    setCheckoutBusy(true);
    setError(null);
    setCheckoutResult(null);

    try {
      const checkout = await createAdminCheckout(
        session.accessToken,
        outletId,
        order.id,
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
    if (!session?.accessToken || !order || !outletId) {
      return;
    }

    setManualBusy(true);
    setError(null);
    setCheckoutResult(null);

    try {
      const updated = await verifyManualPayNow(
        session.accessToken,
        outletId,
        order.id,
        createIdempotencyKey(),
        {
          amountCents: order.grandTotalCents,
          reference: manualReference.trim(),
          reason: manualReason.trim(),
        },
      );
      setOrder(updated);
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
    if (!session?.accessToken || !order || !outletId) {
      return;
    }

    setCancelBusy(true);
    setError(null);
    setCheckoutResult(null);

    try {
      const updated = await cancelOrder(session.accessToken, outletId, order.id, {
        reason: cancelReason.trim(),
      });
      setOrder(updated);
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
      title="Order detail"
      subtitle="Open a single ticket, verify payment, and move it through service without returning to the board."
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

      {busy ? (
        <section className="panel section-panel">
          <p className="eyebrow">Hydrating ticket</p>
          <h2 className="section-title serif">Loading order detail...</h2>
          <p className="supporting-copy">
            Live sync: {formatRealtimeStatus(realtimeStatus)}
          </p>
        </section>
      ) : !order ? (
        <section className="panel section-panel">
          <div className="empty-state">
            <h3>Order not available</h3>
            <p className="supporting-copy">
              This order could not be loaded for the current outlet session.
            </p>
            <Link className="secondary-button" href={`/outlets/${outletId}/orders`}>
              Back to live orders
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section className="panel section-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Ticket overview</p>
                <h2 className="section-title serif">#{order.orderNumber}</h2>
                <p className="supporting-copy">
                  {order.table?.zone?.name ?? 'No zone'} |{' '}
                  {order.table?.displayName ?? 'No table'} |{' '}
                  {new Date(order.createdAt).toLocaleString()}
                </p>
                <p className="supporting-copy">
                  Live sync: {formatRealtimeStatus(realtimeStatus)}
                </p>
              </div>
              <div className="inline-actions">
                <Link className="secondary-button" href={`/outlets/${outletId}/orders`}>
                  Back to live orders
                </Link>
                {order.table ? (
                  <Link
                    className="secondary-button"
                    href={`/outlets/${outletId}/orders?tableId=${order.table.id}`}
                  >
                    Open table queue
                  </Link>
                ) : null}
                {order.table ? (
                  <Link
                    className="secondary-button"
                    href={`/outlets/${outletId}/pos?tableId=${order.table.id}`}
                  >
                    Open table in POS
                  </Link>
                ) : null}
                <span className={`status-pill ${statusTone(order.status)}`}>
                  {formatEnum(order.status)}
                </span>
              </div>
            </div>

            <div className="detail-grid">
              <article className="sub-panel">
                <h3>Order snapshot</h3>
                <div className="queue-metrics">
                  <div className="metric-inline">
                    <span>Source</span>
                    <strong>{formatEnum(order.source)}</strong>
                  </div>
                  <div className="metric-inline">
                    <span>Service type</span>
                    <strong>{formatEnum(order.serviceType)}</strong>
                  </div>
                  <div className="metric-inline">
                    <span>Payment</span>
                    <strong>{formatEnum(order.paymentStatus)}</strong>
                  </div>
                  <div className="metric-inline">
                    <span>Table</span>
                    <strong>{order.table?.tableCode ?? 'No table'}</strong>
                  </div>
                  <div className="metric-inline">
                    <span>Total</span>
                    <strong>{formatMoney(order.currency, order.grandTotalCents)}</strong>
                  </div>
                </div>
              </article>

              <article className="sub-panel">
                <h3>Guest and timing</h3>
                <div className="stack-list">
                  <div className="stack-row">
                    <span>Customer</span>
                    <strong>{order.customerName ?? 'Walk-in / guest'}</strong>
                  </div>
                  <div className="stack-row">
                    <span>Phone</span>
                    <strong>{order.customerPhone ?? 'Not provided'}</strong>
                  </div>
                  <div className="stack-row">
                    <span>Updated</span>
                    <strong>{new Date(order.updatedAt).toLocaleString()}</strong>
                  </div>
                  {paidAt ? (
                    <div className="stack-row">
                      <span>Paid</span>
                      <strong>{new Date(paidAt).toLocaleString()}</strong>
                    </div>
                  ) : null}
                </div>
              </article>
            </div>
          </section>

          <section className="detail-grid">
            <article className="panel section-panel">
              <h3>Items</h3>
              <div className="stack-list">
                {order.items.map((item) => (
                  <div className="stack-row" key={item.id}>
                    <div>
                      <strong>
                        {item.quantity} x {item.itemName}
                      </strong>
                      {item.variantName ? (
                        <p className="supporting-copy">Variant: {item.variantName}</p>
                      ) : null}
                      {item.remarks ? (
                        <p className="supporting-copy">Note: {item.remarks}</p>
                      ) : null}
                      {item.modifiers.length ? (
                        <ul className="sub-list">
                          {item.modifiers.map((modifier) => (
                            <li key={modifier.id}>{modifier.modifierOptionName}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    <strong>{formatMoney(order.currency, item.lineTotalCents)}</strong>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel section-panel">
              <h3>Bill summary</h3>
              <div className="queue-metrics">
                <div className="metric-inline">
                  <span>Subtotal</span>
                  <strong>{formatMoney(order.currency, order.subtotalCents)}</strong>
                </div>
                <div className="metric-inline">
                  <span>Service</span>
                  <strong>
                    {formatMoney(order.currency, order.serviceChargeTotalCents)}
                  </strong>
                </div>
                <div className="metric-inline">
                  <span>GST</span>
                  <strong>{formatMoney(order.currency, order.gstTotalCents)}</strong>
                </div>
                <div className="metric-inline">
                  <span>Total</span>
                  <strong>{formatMoney(order.currency, order.grandTotalCents)}</strong>
                </div>
              </div>
            </article>
          </section>

          <section className="detail-grid">
            <article className="panel section-panel">
              <h3>Payments and tickets</h3>
              <div className="stack-list">
                {order.payments.map((payment) => (
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
                    <strong>{formatMoney(order.currency, payment.amountCents)}</strong>
                  </div>
                ))}
                {order.kitchenTickets.map((ticket) => (
                  <div className="stack-row" key={ticket.id}>
                    <div>
                      <strong>{ticket.station?.name ?? 'Kitchen station'}</strong>
                      <p className="supporting-copy">Ticket {ticket.id.slice(0, 8)}</p>
                    </div>
                    <span className={`status-pill ${statusTone(ticket.status)}`}>
                      {formatEnum(ticket.status)}
                    </span>
                  </div>
                ))}
                {order.printJobs.map((job) => (
                  <div className="stack-row" key={job.id}>
                    <div>
                      <strong>{formatEnum(job.template)}</strong>
                      <p className="supporting-copy">
                        {job.printer?.name ?? 'No printer assigned'}
                      </p>
                    </div>
                    <span className={`status-pill ${statusTone(job.status)}`}>
                      {formatEnum(job.status)}
                    </span>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel section-panel">
              <h3>Edit unpaid order</h3>
              {supportsAmendment ? (
                <div className="form-grid">
                  <p className="supporting-copy">
                    Reopen this unpaid POS or waiter order in the staff composer
                    to adjust items, guest details, table assignment, or payment
                    method before settlement continues.
                  </p>
                  <Link
                    className="primary-button"
                    href={`/outlets/${outletId}/pos?orderId=${order.id}`}
                  >
                    Edit in POS
                  </Link>
                </div>
              ) : (
                <p className="supporting-copy">
                  Only unpaid staff-assisted orders can be amended here.
                </p>
              )}
            </article>
          </section>

          <section className="detail-grid">
            <article className="panel section-panel">
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
                    {checkoutBusy ? 'Creating checkout...' : 'Create HitPay checkout'}
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
                <form className="form-grid" onSubmit={handleVerifyManualPayment}>
                  <p className="supporting-copy">
                    Confirm the outlet has received the full manual payment
                    before the order proceeds to the kitchen.
                  </p>
                  <div className="field">
                    <label htmlFor="manual-reference-standalone">Reference</label>
                    <input
                      id="manual-reference-standalone"
                      onChange={(event) => setManualReference(event.target.value)}
                      placeholder="Transfer or receipt reference"
                      value={manualReference}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="manual-reason-standalone">Reason</label>
                    <textarea
                      id="manual-reason-standalone"
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
                  No payment action is needed right now.
                </p>
              )}
            </article>

            <article className="panel section-panel">
              <h3>Void order</h3>
              {supportsCancellation ? (
                <form className="form-grid" onSubmit={handleCancelOrder}>
                  <p className="supporting-copy">
                    Void this order before it reaches kitchen release.
                  </p>
                  <div className="field">
                    <label htmlFor="cancel-reason-standalone">Reason</label>
                    <textarea
                      id="cancel-reason-standalone"
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
                  Only pre-kitchen orders that are still awaiting or processing
                  payment can be voided here.
                </p>
              )}
            </article>
          </section>

          <section className="panel section-panel">
            <h3>Next service action</h3>
            {nextAction ? (
              <form className="form-grid" onSubmit={submitNextStatus}>
                <p className="supporting-copy">
                  This order can move to <strong>{formatEnum(nextAction.status)}</strong>.
                </p>
                <div className="field">
                  <label htmlFor="detail-reason">Reason</label>
                  <textarea
                    id="detail-reason"
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
                No staff status transition is available from the current state.
              </p>
            )}
          </section>
        </>
      )}
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

function formatRealtimeStatus(status: RealtimeStatus) {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'connecting':
      return 'Connecting';
    case 'offline':
      return 'Offline';
    case 'error':
      return 'Error';
    default:
      return 'Idle';
  }
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
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
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
