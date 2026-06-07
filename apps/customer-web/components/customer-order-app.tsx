'use client';

import {
  AlertCircle,
  ArrowRight,
  ChevronRight,
  CircleHelp,
  MapPin,
  Search,
  ShoppingBag,
  UtensilsCrossed,
  WifiOff,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createCheckout, createOrder, resolveQr } from '@/lib/api';
import { calculateCartTotals, formatMoney } from '@/lib/money';
import type {
  CartItem,
  MenuItem,
  PaymentMethod,
  PublicOrder,
  PublicQrResponse,
} from '@/lib/types';
import { CartDrawer } from './cart-drawer';
import { ItemCustomizer } from './item-customizer';
import { ProductImage } from './product-image';

export function CustomerOrderApp({
  publicCode,
  token,
}: {
  publicCode: string;
  token: string;
}) {
  const [qr, setQr] = useState<PublicQrResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const orderKey = useRef<string | null>(null);
  const paymentKey = useRef<string | null>(null);
  const pendingOrder = useRef<PublicOrder | null>(null);
  const storageKey = `restaurant-cart:${publicCode}`;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setQr(await resolveQr(publicCode, token));
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : 'This table menu could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, [publicCode, token]);

  useEffect(() => {
    void load();
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [load]);

  useEffect(() => {
    const saved = sessionStorage.getItem(storageKey);
    if (!saved) return;
    try {
      setCart(JSON.parse(saved) as CartItem[]);
    } catch {
      sessionStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  useEffect(() => {
    if (cart.length > 0) {
      sessionStorage.setItem(storageKey, JSON.stringify(cart));
    } else {
      sessionStorage.removeItem(storageKey);
    }
  }, [cart, storageKey]);

  const categories = qr?.menu?.version?.categories ?? [];
  const visibleCategories = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return categories;
    return categories
      .map((category) => ({
        ...category,
        items: category.items.filter((item) =>
          `${item.name} ${item.description ?? ''}`
            .toLocaleLowerCase()
            .includes(query),
        ),
      }))
      .filter((category) => category.items.length > 0);
  }, [categories, search]);

  const totals = useMemo(
    () =>
      qr
        ? calculateCartTotals(cart, qr.outlet)
        : {
            subtotalCents: 0,
            serviceChargeCents: 0,
            gstCents: 0,
            totalCents: 0,
          },
    [cart, qr],
  );
  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);

  function resetCheckoutAttempt() {
    orderKey.current = null;
    paymentKey.current = null;
    pendingOrder.current = null;
    setCheckoutError(null);
  }

  function addItem(item: CartItem) {
    resetCheckoutAttempt();
    setCart((current) => [...current, item]);
    setSelectedItem(null);
  }

  function updateQuantity(cartId: string, quantity: number) {
    resetCheckoutAttempt();
    setCart((current) =>
      current.map((item) =>
        item.cartId === cartId
          ? { ...item, quantity: Math.max(1, Math.min(99, quantity)) }
          : item,
      ),
    );
  }

  function removeItem(cartId: string) {
    resetCheckoutAttempt();
    setCart((current) => current.filter((item) => item.cartId !== cartId));
  }

  async function checkout(method: PaymentMethod) {
    if (!qr || cart.length === 0 || checkoutBusy) return;
    setCheckoutBusy(true);
    setCheckoutError(null);
    try {
      orderKey.current ??= crypto.randomUUID();
      pendingOrder.current ??= await createOrder({
        publicCode,
        token,
        idempotencyKey: orderKey.current,
        paymentMethod: method,
        items: cart,
      });
      const order = pendingOrder.current;
      const routeBase = `${window.location.origin}/q/${encodeURIComponent(publicCode)}/${encodeURIComponent(token)}/payment`;

      paymentKey.current ??= crypto.randomUUID();
      const payment = await createCheckout({
        publicCode,
        token,
        orderId: order.orderId,
        idempotencyKey: paymentKey.current,
        paymentMethod: method,
        successUrl: `${routeBase}/success`,
        cancelUrl: `${routeBase}/cancel`,
      });
      setCart([]);
      window.location.assign(payment.checkoutUrl);
    } catch (error) {
      setCheckoutError(
        error instanceof Error
          ? error.message
          : 'Checkout could not be started. Please try again.',
      );
    } finally {
      setCheckoutBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="menu-page">
        <div className="menu-shell">
          <div className="skeleton hero-skeleton" />
          <div className="skeleton search-skeleton" />
          <div className="skeleton category-skeleton" />
          <div className="product-grid">
            {[1, 2, 3, 4].map((item) => (
              <div className="skeleton product-skeleton" key={item} />
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (loadError || !qr) {
    return (
      <main className="state-page">
        <section className="state-card">
          <div className="state-icon danger">
            <AlertCircle size={28} />
          </div>
          <p className="eyebrow">Menu unavailable</p>
          <h1>We could not open this table menu</h1>
          <p>{loadError ?? 'The QR code may have expired or been replaced.'}</p>
          <button
            className="primary-button"
            type="button"
            onClick={() => void load()}
          >
            Try again
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="menu-page">
      {!online && (
        <div className="offline-banner" role="status">
          <WifiOff size={17} />
          You are offline. Reconnect before placing your order.
        </div>
      )}

      <div className="menu-shell">
        <header className="restaurant-header">
          <div className="restaurant-brand">
            <div className="brand-mark">
              <UtensilsCrossed size={24} strokeWidth={1.8} />
            </div>
            <div>
              <p className="eyebrow">Welcome to</p>
              <h1>{qr.outlet.name}</h1>
            </div>
          </div>
          <button className="help-button" type="button" disabled>
            <CircleHelp size={18} />
            Help
          </button>
        </header>

        <section className="table-confidence" aria-label="Order location">
          <div>
            <MapPin size={20} aria-hidden="true" />
            <span>
              <small>{qr.table.zone}</small>
              <strong>{qr.table.name}</strong>
            </span>
          </div>
          <span className="dine-in-badge">Dine in</span>
        </section>

        <section className="menu-intro">
          <p className="eyebrow">Order at your own pace</p>
          <h2>What are you craving?</h2>
          <p>Choose your favourites and customise every detail.</p>
        </section>

        <label className="search-field" htmlFor="menu-search">
          <Search size={20} aria-hidden="true" />
          <input
            id="menu-search"
            type="search"
            placeholder="Search the menu"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        {categories.length > 0 && (
          <nav className="category-nav" aria-label="Menu categories">
            {categories.map((category) => (
              <a key={category.id} href={`#category-${category.id}`}>
                {category.name}
              </a>
            ))}
          </nav>
        )}

        {!qr.menu?.version ? (
          <section className="empty-menu">
            <UtensilsCrossed size={28} />
            <h2>The menu is being prepared</h2>
            <p>Please ask a staff member for today&apos;s selections.</p>
          </section>
        ) : visibleCategories.length === 0 ? (
          <section className="empty-menu">
            <Search size={28} />
            <h2>No dishes found</h2>
            <p>Try another search or browse the categories above.</p>
          </section>
        ) : (
          <div className="menu-categories">
            {visibleCategories.map((category) => (
              <section
                className="menu-category"
                id={`category-${category.id}`}
                key={category.id}
              >
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Made fresh</p>
                    <h2>{category.name}</h2>
                  </div>
                  <span>{category.items.length} items</span>
                </div>
                <div className="product-grid">
                  {category.items.map((item) => (
                    <button
                      className="product-card"
                      type="button"
                      key={item.id}
                      disabled={item.soldOut}
                      onClick={() => setSelectedItem(item)}
                    >
                      <div className="product-card-image">
                        <ProductImage src={item.imageUrl} alt={item.name} />
                        {item.soldOut && (
                          <span className="sold-out">Sold out</span>
                        )}
                      </div>
                      <div className="product-card-copy">
                        <div>
                          <h3>{item.name}</h3>
                          {item.description && <p>{item.description}</p>}
                        </div>
                        <div className="product-card-footer">
                          <strong>
                            {formatMoney(
                              item.basePriceCents,
                              qr.outlet.currency,
                            )}
                          </strong>
                          <span className="add-circle" aria-hidden="true">
                            <ChevronRight size={18} />
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {cart.length > 0 && (
        <div className="cart-bar-wrap">
          <button
            className="cart-bar"
            type="button"
            onClick={() => setCartOpen(true)}
          >
            <span className="cart-count">
              <ShoppingBag size={19} />
              {cartCount}
            </span>
            <span>
              View order
              <small>
                {formatMoney(totals.totalCents, qr.outlet.currency)}
              </small>
            </span>
            <ArrowRight size={20} />
          </button>
        </div>
      )}

      {selectedItem && (
        <ItemCustomizer
          item={selectedItem}
          currency={qr.outlet.currency}
          onClose={() => setSelectedItem(null)}
          onAdd={addItem}
        />
      )}

      <CartDrawer
        open={cartOpen}
        cart={cart}
        qr={qr}
        totals={totals}
        busy={checkoutBusy}
        error={checkoutError}
        onClose={() => setCartOpen(false)}
        onQuantity={updateQuantity}
        onRemove={removeItem}
        onCheckout={(method) => void checkout(method)}
      />
    </main>
  );
}
