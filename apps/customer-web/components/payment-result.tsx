'use client';

import {
  AlertCircle,
  Check,
  ChevronRight,
  Clock3,
  LoaderCircle,
  ReceiptText,
  RotateCcw,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getOrder, reconcileHitPayReturn } from '@/lib/api';
import { formatMoney } from '@/lib/money';
import type { PublicOrder } from '@/lib/types';

const terminalPaymentStatuses = new Set([
  'PAID',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
  'MANUAL_VERIFICATION_REQUIRED',
]);

export function PaymentResult({
  publicCode,
  token,
  mode,
}: {
  publicCode: string;
  token: string;
  mode: 'success' | 'cancel';
}) {
  const query = useSearchParams();
  const orderId = query.get('order_id');
  const providerReference = query.get('reference');
  const providerStatus = query.get('status');
  const manual = query.get('manual') === '1';
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setError('The order reference is missing.');
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    async function poll() {
      try {
        if (attempts === 0 && (providerReference || providerStatus)) {
          await reconcileHitPayReturn({
            publicCode,
            token,
            orderId: orderId!,
            reference: providerReference,
            status: providerStatus,
          }).catch(() => undefined);
        }

        const result = await getOrder(publicCode, token, orderId!);
        if (stopped) return;
        setOrder(result);
        setError(null);
        attempts += 1;
        if (
          !terminalPaymentStatuses.has(result.paymentStatus) &&
          attempts < 45
        ) {
          timer = setTimeout(() => void poll(), 2000);
        }
      } catch (pollError) {
        if (stopped) return;
        setError(
          pollError instanceof Error
            ? pollError.message
            : 'We could not check your order.',
        );
      }
    }

    void poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [orderId, providerReference, providerStatus, publicCode, token]);

  const paid = order?.paymentStatus === 'PAID';
  const manualPending =
    manual || order?.paymentStatus === 'MANUAL_VERIFICATION_REQUIRED';
  const failed = ['FAILED', 'CANCELLED'].includes(order?.paymentStatus ?? '');
  const processing = Boolean(order && !paid && !manualPending && !failed);
  const menuUrl = `/q/${encodeURIComponent(publicCode)}/${encodeURIComponent(token)}`;

  return (
    <main className="result-page">
      <section className="result-card">
        <div
          className={`result-icon ${
            paid
              ? 'success'
              : failed || mode === 'cancel'
                ? 'danger'
                : 'pending'
          }`}
        >
          {paid ? (
            <Check size={34} />
          ) : failed || mode === 'cancel' ? (
            <AlertCircle size={34} />
          ) : processing ? (
            <LoaderCircle className="spin" size={34} />
          ) : (
            <Clock3 size={34} />
          )}
        </div>

        <p className="eyebrow">
          {order ? `Order ${order.orderNumber}` : 'Your table order'}
        </p>
        <h1>
          {paid
            ? 'Your order is with the kitchen'
            : manualPending
              ? 'Waiting for staff verification'
              : mode === 'cancel' || failed
                ? 'Payment was not completed'
                : 'Confirming your payment'}
        </h1>
        <p className="result-copy" aria-live="polite">
          {paid
            ? 'Payment is confirmed. We will prepare everything and bring it to your table.'
            : manualPending
              ? 'Please show your payment confirmation to a staff member. The kitchen receives your order after verification.'
              : mode === 'cancel' || failed
                ? 'Nothing has been sent to the kitchen. You can return to the menu and try again.'
                : 'Payment confirmation can take a short moment. Keep this page open; it updates automatically.'}
        </p>

        {error && (
          <div className="inline-alert danger" role="alert">
            {error}
          </div>
        )}

        {order && (
          <section className="receipt-card" aria-labelledby="receipt-title">
            <div className="receipt-title">
              <span>
                <ReceiptText size={19} />
                <strong id="receipt-title">Order summary</strong>
              </span>
              <strong>
                {formatMoney(order.grandTotalCents, order.currency)}
              </strong>
            </div>
            <div className="receipt-items">
              {order.items.map((item) => (
                <div key={item.id}>
                  <span>
                    {item.quantity} x {item.itemName}
                    {item.variantName && <small>{item.variantName}</small>}
                  </span>
                  <strong>
                    {formatMoney(item.lineTotalCents, order.currency)}
                  </strong>
                </div>
              ))}
            </div>
            <dl className="result-totals">
              <div>
                <dt>Subtotal</dt>
                <dd>{formatMoney(order.subtotalCents, order.currency)}</dd>
              </div>
              {order.serviceChargeTotalCents > 0 && (
                <div>
                  <dt>Service charge</dt>
                  <dd>
                    {formatMoney(order.serviceChargeTotalCents, order.currency)}
                  </dd>
                </div>
              )}
              {order.gstTotalCents > 0 && (
                <div>
                  <dt>GST</dt>
                  <dd>{formatMoney(order.gstTotalCents, order.currency)}</dd>
                </div>
              )}
            </dl>
          </section>
        )}

        <Link className="primary-button result-button" href={menuUrl}>
          {paid || manualPending ? 'Order something else' : 'Return to menu'}
          <ChevronRight size={19} />
        </Link>
        {(processing || error) && (
          <button
            className="secondary-button result-button"
            type="button"
            onClick={() => window.location.reload()}
          >
            <RotateCcw size={18} />
            Check again
          </button>
        )}
      </section>
    </main>
  );
}
