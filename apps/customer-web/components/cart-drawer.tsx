'use client';

import {
  ArrowRight,
  CreditCard,
  Minus,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { formatMoney } from '@/lib/money';
import type { CartItem, PaymentMethod, PublicQrResponse } from '@/lib/types';
import { ProductImage } from './product-image';

const paymentCopy: Record<
  PaymentMethod,
  { title: string; description: string }
> = {
  STRIPE_CARD: {
    title: 'Card or wallet',
    description: 'Secure checkout with HitPay',
  },
};

export function CartDrawer({
  open,
  cart,
  qr,
  totals,
  busy,
  error,
  onClose,
  onQuantity,
  onRemove,
  onCheckout,
}: {
  open: boolean;
  cart: CartItem[];
  qr: PublicQrResponse;
  totals: {
    subtotalCents: number;
    serviceChargeCents: number;
    gstCents: number;
    totalCents: number;
  };
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onQuantity: (cartId: string, quantity: number) => void;
  onRemove: (cartId: string) => void;
  onCheckout: (method: PaymentMethod) => void;
}) {
  const methods = useMemo(
    () =>
      (['STRIPE_CARD'] as PaymentMethod[]).filter(
        (paymentMethod) => qr.paymentAvailability[paymentMethod],
      ),
    [qr.paymentAvailability],
  );
  const [method, setMethod] = useState<PaymentMethod>(
    methods[0] ?? 'STRIPE_CARD',
  );

  useEffect(() => {
    if (open) document.body.classList.add('no-scroll');
    return () => document.body.classList.remove('no-scroll');
  }, [open]);

  useEffect(() => {
    if (!methods.includes(method) && methods[0]) setMethod(methods[0]);
  }, [method, methods]);

  if (!open) return null;

  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        className="cart-drawer"
        aria-labelledby="cart-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="drawer-header">
          <div>
            <p className="eyebrow">Table {qr.table.code}</p>
            <h2 id="cart-title">Your order</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Close order"
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </header>

        <div className="drawer-body">
          <div className="cart-items">
            {cart.map((item) => (
              <article className="cart-item" key={item.cartId}>
                <ProductImage src={item.imageUrl} alt="" compact />
                <div className="cart-item-copy">
                  <div className="cart-item-title">
                    <h3>{item.name}</h3>
                    <strong>
                      {formatMoney(
                        item.unitPriceCents * item.quantity,
                        qr.outlet.currency,
                      )}
                    </strong>
                  </div>
                  {(item.variantName || item.modifierNames.length > 0) && (
                    <p>
                      {[item.variantName, ...item.modifierNames]
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                  )}
                  {item.remarks && (
                    <p className="cart-remarks">{item.remarks}</p>
                  )}
                  <div className="cart-item-actions">
                    <div className="quantity-stepper small">
                      <button
                        type="button"
                        aria-label={`Decrease ${item.name} quantity`}
                        onClick={() =>
                          item.quantity === 1
                            ? onRemove(item.cartId)
                            : onQuantity(item.cartId, item.quantity - 1)
                        }
                      >
                        <Minus size={15} />
                      </button>
                      <strong>{item.quantity}</strong>
                      <button
                        type="button"
                        aria-label={`Increase ${item.name} quantity`}
                        onClick={() =>
                          onQuantity(item.cartId, item.quantity + 1)
                        }
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                    <button
                      className="text-button danger-text"
                      type="button"
                      onClick={() => onRemove(item.cartId)}
                    >
                      <Trash2 size={15} />
                      Remove
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <section className="bill-summary" aria-labelledby="summary-title">
            <h3 id="summary-title">Bill summary</h3>
            <dl>
              <div>
                <dt>Subtotal</dt>
                <dd>{formatMoney(totals.subtotalCents, qr.outlet.currency)}</dd>
              </div>
              {qr.outlet.serviceChargeEnabled && (
                <div>
                  <dt>
                    Service charge{' '}
                    <small>{qr.outlet.serviceChargeBps / 100}%</small>
                  </dt>
                  <dd>
                    {formatMoney(totals.serviceChargeCents, qr.outlet.currency)}
                  </dd>
                </div>
              )}
              {qr.outlet.gstEnabled && (
                <div>
                  <dt>
                    GST <small>{qr.outlet.gstRateBps / 100}%</small>
                  </dt>
                  <dd>{formatMoney(totals.gstCents, qr.outlet.currency)}</dd>
                </div>
              )}
              <div className="bill-total">
                <dt>Total</dt>
                <dd>{formatMoney(totals.totalCents, qr.outlet.currency)}</dd>
              </div>
            </dl>
            <p className="server-price-note">
              Final totals are confirmed securely before payment.
            </p>
          </section>

          <fieldset className="payment-options">
            <legend>How would you like to pay?</legend>
            {methods.length === 0 ? (
              <div className="inline-alert warning">
                Online payment is temporarily unavailable. Please ask a staff
                member for help.
              </div>
            ) : (
              methods.map((paymentMethod) => (
                <label className="payment-option" key={paymentMethod}>
                  <input
                    type="radio"
                    name="payment-method"
                    checked={method === paymentMethod}
                    onChange={() => setMethod(paymentMethod)}
                  />
                  <span className="payment-icon" aria-hidden="true">
                    <CreditCard size={21} />
                  </span>
                  <span>
                    <strong>{paymentCopy[paymentMethod].title}</strong>
                    <small>{paymentCopy[paymentMethod].description}</small>
                  </span>
                  <span className="radio-dot" aria-hidden="true" />
                </label>
              ))
            )}
          </fieldset>

          {error && (
            <div className="inline-alert danger" role="alert">
              {error}
            </div>
          )}

          <div className="secure-note">
            <ShieldCheck size={18} aria-hidden="true" />
            HitPay handles card and wallet details securely.
          </div>
        </div>

        <footer className="drawer-footer">
          <button
            className="primary-button checkout-button"
            type="button"
            disabled={busy || methods.length === 0 || cart.length === 0}
            onClick={() => onCheckout(method)}
          >
            <span>
              {busy ? 'Preparing secure payment...' : 'Continue to payment'}
            </span>
            {!busy && <ArrowRight size={20} />}
          </button>
        </footer>
      </aside>
    </div>
  );
}
