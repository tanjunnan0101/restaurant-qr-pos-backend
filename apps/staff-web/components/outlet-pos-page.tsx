'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  amendStaffOrder,
  createAdminCheckout,
  createStaffOrder,
  getOrder,
  getMenuDetail,
  getMenus,
  getTables,
} from '@/lib/api';
import type {
  CheckoutSessionResponse,
  CreateStaffOrderInput,
  MenuListEntry,
  OrderDetail,
  OutletSummary,
  StaffMenuDetail,
  StaffPaymentMethod,
  StaffServiceType,
  TableZone,
} from '@/lib/types';
import {
  OutletHeader,
  OutletPageLayout,
  useOutletContext,
} from './outlet-page-base';

type MenuItem =
  StaffMenuDetail['versions'][number]['categories'][number]['items'][number];

interface CartItem {
  id: string;
  menuItemId: string;
  itemName: string;
  variantId?: string;
  variantName?: string;
  quantity: number;
  remarks?: string;
  modifierOptionIds: string[];
  modifierLabels: string[];
  unitPriceCents: number;
  lineTotalCents: number;
}

interface DraftCustomization {
  item: MenuItem;
  editingCartItemId?: string;
  quantity: number;
  variantId?: string;
  modifierSelections: Record<string, string[]>;
  remarks: string;
  error: string | null;
}

const serviceTypeOptions: Array<{
  value: StaffServiceType;
  label: string;
}> = [
  { value: 'DINE_IN', label: 'Dine in' },
  { value: 'TAKEAWAY', label: 'Takeaway' },
  { value: 'PICKUP', label: 'Pickup' },
  { value: 'COUNTER', label: 'Counter' },
];

const paymentMethodOptions: Array<{
  value: StaffPaymentMethod;
  label: string;
  note: string;
}> = [
  {
    value: 'ONLINE_CARD',
    label: 'Card or wallet',
    note: 'Create a HitPay hosted checkout for the customer.',
  },
  {
    value: 'MANUAL_PAYNOW',
    label: 'Manual PayNow',
    note: 'Create the order and let staff verify payment later.',
  },
  {
    value: 'CASH',
    label: 'Cash',
    note: 'Mark the order paid immediately and release it to the kitchen.',
  },
];

export function OutletPosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    session,
    outlet,
    outletId,
    error: outletError,
    busy: outletBusy,
  } = useOutletContext();
  const editOrderId = searchParams.get('orderId');
  const [menus, setMenus] = useState<MenuListEntry[]>([]);
  const [selectedMenuId, setSelectedMenuId] = useState<string>('');
  const [menuDetail, setMenuDetail] = useState<StaffMenuDetail | null>(null);
  const [zones, setZones] = useState<TableZone[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [serviceType, setServiceType] = useState<StaffServiceType>('DINE_IN');
  const [paymentMethod, setPaymentMethod] =
    useState<StaffPaymentMethod>('ONLINE_CARD');
  const [menuSearch, setMenuSearch] = useState('');
  const [cashTendered, setCashTendered] = useState('');
  const [tableId, setTableId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [source, setSource] = useState<'POS' | 'WAITER'>('POS');
  const [customizing, setCustomizing] = useState<DraftCustomization | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editOrder, setEditOrder] = useState<OrderDetail | null>(null);
  const [resolvedEditMenuForOrderId, setResolvedEditMenuForOrderId] = useState<
    string | null
  >(null);
  const [success, setSuccess] = useState<{
    amended: boolean;
    paymentMethod: StaffPaymentMethod;
    order: {
      id: string;
      orderNumber: string;
      status: string;
      paymentStatus: string;
      grandTotalCents: number;
      currency: string;
    };
    checkout: CheckoutSessionResponse | null;
    cashTenderedCents?: number;
    changeDueCents?: number;
  } | null>(null);

  useEffect(() => {
    if (!session?.accessToken || !outletId) {
      return;
    }
    const authToken = session.accessToken;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [menuList, tableZones] = await Promise.all([
          getMenus(authToken, outletId),
          getTables(authToken, outletId),
        ]);
        const posMenus = menuList.filter(
          (menu) =>
            (menu.channel === 'POS' || menu.channel === 'BOTH') &&
            menu.versions.some((version) => version.status === 'PUBLISHED'),
        );
        if (!cancelled) {
          setMenus(posMenus);
          setSelectedMenuId((current) => current || posMenus[0]?.id || '');
          setZones(tableZones);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'POS resources failed to load.',
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [outletId, session]);

  useEffect(() => {
    if (!session?.accessToken || !outletId || !selectedMenuId) {
      setMenuDetail(null);
      return;
    }
    const authToken = session.accessToken;
    let cancelled = false;

    async function loadDetail() {
      setDetailLoading(true);
      try {
        const detail = await getMenuDetail(authToken, outletId, selectedMenuId);
        if (!cancelled) {
          setMenuDetail(detail);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Menu detail failed to load.',
          );
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }

    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [outletId, selectedMenuId, session]);

  useEffect(() => {
    if (!editOrderId) {
      setEditOrder(null);
      setResolvedEditMenuForOrderId(null);
      return;
    }
    if (!session?.accessToken || !outletId) {
      return;
    }

    const authToken = session.accessToken;
    const targetEditOrderId = editOrderId;
    let cancelled = false;

    async function loadEditableOrder() {
      setEditLoading(true);
      setError(null);
      try {
        const order = await getOrder(authToken, outletId, targetEditOrderId);
        if (
          order.status !== 'PENDING_PAYMENT' ||
          (order.source !== 'POS' && order.source !== 'WAITER')
        ) {
          throw new Error(
            'Only unpaid POS or waiter orders can be edited in the staff POS.',
          );
        }
        if (!cancelled) {
          setEditOrder(order);
          setSource(order.source as 'POS' | 'WAITER');
          setServiceType(order.serviceType);
          setPaymentMethod(
            order.payments[0]?.method === 'MANUAL_PAYNOW'
              ? 'MANUAL_PAYNOW'
              : 'ONLINE_CARD',
          );
          setTableId(order.table?.id ?? '');
          setCustomerName(order.customerName ?? '');
          setCustomerPhone(order.customerPhone ?? '');
          setCart(order.items.map(mapOrderItemToCartItem));
          setSuccess(null);
          setResolvedEditMenuForOrderId(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Order amendment context failed to load.',
          );
        }
      } finally {
        if (!cancelled) {
          setEditLoading(false);
        }
      }
    }

    void loadEditableOrder();
    return () => {
      cancelled = true;
    };
  }, [editOrderId, outletId, session]);

  useEffect(() => {
    if (
      !editOrder ||
      !editOrderId ||
      !menus.length ||
      !session?.accessToken ||
      !outletId ||
      resolvedEditMenuForOrderId === editOrder.id
    ) {
      return;
    }

    const authToken = session.accessToken;
    const currentEditOrder = editOrder;
    const requiredItemIds = editOrder.items
      .map((item) => item.menuItemId)
      .filter((itemId): itemId is string => Boolean(itemId));

    let cancelled = false;

    async function resolveMenu() {
      for (const menu of menus) {
        const detail = await getMenuDetail(authToken, outletId, menu.id);
        const publishedVersion = detail.versions.find(
          (version) => version.status === 'PUBLISHED',
        );
        const availableItemIds = new Set(
          publishedVersion?.categories.flatMap((category) =>
            category.items.map((item) => item.id),
          ) ?? [],
        );
        if (requiredItemIds.every((itemId) => availableItemIds.has(itemId))) {
          if (!cancelled) {
            setSelectedMenuId(menu.id);
            setResolvedEditMenuForOrderId(currentEditOrder.id);
          }
          return;
        }
      }

      if (!cancelled) {
        setError(
          'No published POS menu contains all items from this order. Select a compatible menu before saving changes.',
        );
        setResolvedEditMenuForOrderId(currentEditOrder.id);
      }
    }

    void resolveMenu();
    return () => {
      cancelled = true;
    };
  }, [
    editOrder,
    editOrderId,
    menus,
    outletId,
    resolvedEditMenuForOrderId,
    session,
  ]);

  useEffect(() => {
    if (serviceType !== 'DINE_IN') {
      setTableId('');
    }
  }, [serviceType]);

  const publishedVersion = menuDetail?.versions.find(
    (version) => version.status === 'PUBLISHED',
  );
  const availableTables = useMemo(
    () =>
      zones.flatMap((zone) =>
        zone.tables
          .filter((table) => table.active)
          .map((table) => ({
            ...table,
            zoneName: zone.name,
          })),
      ),
    [zones],
  );
  const summary = useMemo(() => {
    return estimateTotals(outlet, cart);
  }, [cart, outlet]);
  const menuItemsById = useMemo(() => {
    const items = publishedVersion?.categories.flatMap((category) => category.items) ?? [];
    return new Map(items.map((item) => [item.id, item]));
  }, [publishedVersion]);
  const filteredCategories = useMemo(() => {
    if (!publishedVersion) {
      return [];
    }
    const normalizedSearch = normalizeSearch(menuSearch);
    return publishedVersion.categories
      .filter((category) => category.active)
      .map((category) => {
        const items = category.items.filter((item) => {
          if (!item.active) {
            return false;
          }
          if (!normalizedSearch) {
            return true;
          }
          const haystack = normalizeSearch(
            [
              category.name,
              item.name,
              item.description,
              item.preparationStationKey,
            ]
              .filter(Boolean)
              .join(' '),
          );
          return haystack.includes(normalizedSearch);
        });
        return {
          ...category,
          items,
        };
      })
      .filter((category) => category.items.length > 0);
  }, [menuSearch, publishedVersion]);
  const filteredItemCount = useMemo(
    () =>
      filteredCategories.reduce(
        (count, category) => count + category.items.length,
        0,
      ),
    [filteredCategories],
  );
  const cashTenderedCents = useMemo(
    () => parseCurrencyInputToCents(cashTendered),
    [cashTendered],
  );
  const cashChangeDueCents =
    paymentMethod === 'CASH' && cashTenderedCents !== null
      ? cashTenderedCents - summary.grandTotalCents
      : null;
  const submitDisabled =
    submitting ||
    cart.length === 0 ||
    (paymentMethod === 'CASH' &&
      (cashTenderedCents === null || cashTenderedCents < summary.grandTotalCents));

  useEffect(() => {
    if (paymentMethod !== 'CASH') {
      setCashTendered('');
      return;
    }
    if (!cashTendered && summary.grandTotalCents > 0) {
      setCashTendered(formatCurrencyInput(summary.grandTotalCents));
    }
  }, [cashTendered, paymentMethod, summary.grandTotalCents]);

  async function submitOrder() {
    if (!session?.accessToken || !outlet) {
      return;
    }
    if (!selectedMenuId) {
      setError('Choose a published POS menu before creating an order.');
      return;
    }
    if (cart.length === 0) {
      setError('Add at least one item before submitting the order.');
      return;
    }
    if (serviceType === 'DINE_IN' && !tableId) {
      setError('Choose a table for dine-in orders.');
      return;
    }
    if (paymentMethod === 'CASH') {
      if (cashTenderedCents === null) {
        setError('Enter the cash received before completing this sale.');
        return;
      }
      if (cashTenderedCents < summary.grandTotalCents) {
        setError('Cash received is lower than the order total.');
        return;
      }
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const createInput: CreateStaffOrderInput = {
      menuId: selectedMenuId,
      source,
      serviceType,
      paymentMethod,
      ...(serviceType === 'DINE_IN' && tableId ? { tableId } : {}),
      ...(customerName.trim() ? { customerName: customerName.trim() } : {}),
      ...(customerPhone.trim() ? { customerPhone: customerPhone.trim() } : {}),
      items: cart.map((item) => ({
        menuItemId: item.menuItemId,
        ...(item.variantId ? { variantId: item.variantId } : {}),
        quantity: item.quantity,
        modifierOptionIds: item.modifierOptionIds,
        ...(item.remarks?.trim() ? { remarks: item.remarks.trim() } : {}),
      })),
    };

    try {
      const order = editOrder
        ? await amendStaffOrder(
            session.accessToken,
            outletId,
            editOrder.id,
            createInput,
          )
        : await createStaffOrder(
            session.accessToken,
            outletId,
            createIdempotencyKey(),
            createInput,
          );

      let checkout: CheckoutSessionResponse | null = null;
      if (paymentMethod === 'ONLINE_CARD' && typeof window !== 'undefined') {
        checkout = await createAdminCheckout(
          session.accessToken,
          outletId,
          order.id,
          createIdempotencyKey(),
          {
            paymentMethod: 'ONLINE_CARD',
            successUrl: `${window.location.origin}/outlets/${outletId}/orders`,
            cancelUrl: `${window.location.origin}/outlets/${outletId}/orders`,
          },
        );
      }

      setSuccess({
        amended: Boolean(editOrder),
        paymentMethod,
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
          grandTotalCents: order.grandTotalCents,
          currency: order.currency,
        },
        checkout,
        ...(paymentMethod === 'CASH' && cashTenderedCents !== null
          ? {
              cashTenderedCents,
              changeDueCents: cashTenderedCents - summary.grandTotalCents,
            }
          : {}),
      });
      setCart([]);
      setCashTendered('');
      setCustomerName('');
      setCustomerPhone('');
      setEditOrder(null);
      setResolvedEditMenuForOrderId(null);
      if (serviceType !== 'DINE_IN') {
        setTableId('');
      }
      if (editOrderId) {
        router.replace(`/outlets/${outletId}/pos`);
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Failed to create the staff order.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  function addDirectItem(item: MenuItem) {
    const quantity = 1;
    const lineTotalCents = item.basePriceCents * quantity;
    setCart((current) => [
      ...current,
      {
        id: createLocalId(),
        menuItemId: item.id,
        itemName: item.name,
        quantity,
        remarks: '',
        modifierOptionIds: [],
        modifierLabels: [],
        unitPriceCents: item.basePriceCents,
        lineTotalCents,
      },
    ]);
  }

  function openCustomization(item: MenuItem) {
    const firstVariant = item.variants.find((variant) => variant.active);
    setCustomizing({
      item,
      editingCartItemId: undefined,
      quantity: 1,
      variantId: firstVariant?.id,
      modifierSelections: Object.fromEntries(
        item.itemModifierGroups.map((entry) => [entry.modifierGroup.id, []]),
      ),
      remarks: '',
      error: null,
    });
  }

  function commitCustomization() {
    if (!customizing) {
      return;
    }
    const validation = validateCustomization(customizing);
    if (validation) {
      setCustomizing({ ...customizing, error: validation });
      return;
    }
    const priced = buildCartItem(customizing);
    setCart((current) =>
      customizing.editingCartItemId
        ? current.map((item) =>
            item.id === customizing.editingCartItemId ? priced : item,
          )
        : [...current, priced],
    );
    setCustomizing(null);
  }

  function updateCartQuantity(id: string, delta: number) {
    setCart((current) =>
      current
        .map((item) => {
          if (item.id !== id) {
            return item;
          }
          const quantity = Math.max(1, item.quantity + delta);
          return {
            ...item,
            quantity,
            lineTotalCents: item.unitPriceCents * quantity,
          };
        })
        .filter(Boolean),
    );
  }

  function removeCartItem(id: string) {
    setCart((current) => current.filter((item) => item.id !== id));
  }

  function startEditingCartItem(cartItem: CartItem) {
    const sourceItem = menuItemsById.get(cartItem.menuItemId);
    if (!sourceItem) {
      setError(
        'This line can no longer be edited because the source menu item is unavailable in the active POS menu.',
      );
      return;
    }

    setError(null);
    setCustomizing({
      item: sourceItem,
      editingCartItemId: cartItem.id,
      quantity: cartItem.quantity,
      variantId: cartItem.variantId,
      modifierSelections: Object.fromEntries(
        sourceItem.itemModifierGroups.map((entry) => [
          entry.modifierGroup.id,
          cartItem.modifierOptionIds.filter((modifierOptionId) =>
            entry.modifierGroup.options.some(
              (option) => option.id === modifierOptionId,
            ),
          ),
        ]),
      ),
      remarks: cartItem.remarks ?? '',
      error: null,
    });
  }

  return (
    <OutletPageLayout
      title="Staff POS"
      subtitle="Create walk-in orders, assign tables, and start checkout from the service floor."
    >
      {outlet ? <OutletHeader outlet={outlet} /> : null}

      {outletBusy || loading || editLoading ? (
        <section className="panel section-panel">
          <p className="supporting-copy">
            {editOrderId
              ? 'Loading editable order...'
              : 'Loading POS resources...'}
          </p>
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

      {success ? (
        <section className="panel section-panel success-banner">
          <div className="section-header">
            <div>
              <p className="eyebrow">
                {success.amended ? 'Order amended' : 'Order created'}
              </p>
              <h2 className="section-title serif">
                #{success.order.orderNumber}
              </h2>
              <p className="supporting-copy">
                {formatEnum(success.order.status)} |{' '}
                {formatEnum(success.order.paymentStatus)} |{' '}
                {formatMoney(
                  success.order.currency,
                  success.order.grandTotalCents,
                )}
              </p>
            </div>
            {success.checkout?.checkoutUrl ? (
              <button
                className="primary-button"
                onClick={() =>
                  window.open(
                    success.checkout?.checkoutUrl ?? '',
                    '_blank',
                    'noopener,noreferrer',
                  )
                }
                type="button"
              >
                Open HitPay checkout
              </button>
            ) : null}
          </div>
          {success.checkout?.checkoutUrl ? (
            <p className="supporting-copy">
              If the customer is paying by card or wallet, open the hosted
              checkout from here.
            </p>
          ) : success.paymentMethod === 'CASH' ? (
            <div className="stack-list">
              <p className="supporting-copy">
                Cash payment was captured immediately and the order has already
                been released to kitchen flow.
              </p>
              <div className="cash-summary-grid">
                <div className="sub-panel">
                  <span className="metric-label">Cash received</span>
                  <strong>
                    {formatMoney(
                      success.order.currency,
                      success.cashTenderedCents ?? success.order.grandTotalCents,
                    )}
                  </strong>
                </div>
                <div className="sub-panel">
                  <span className="metric-label">Change due</span>
                  <strong>
                    {formatMoney(
                      success.order.currency,
                      success.changeDueCents ?? 0,
                    )}
                  </strong>
                </div>
              </div>
            </div>
          ) : (
            <p className="supporting-copy">
              This order is waiting on manual PayNow verification in the admin
              order flow.
            </p>
          )}
          <div className="inline-actions success-actions">
            <button
              className="secondary-button"
              onClick={() => setSuccess(null)}
              type="button"
            >
              Start new ticket
            </button>
            <button
              className="ghost-button"
              onClick={() => router.push(`/outlets/${outletId}/orders`)}
              type="button"
            >
              Open orders board
            </button>
          </div>
        </section>
      ) : null}

      {editOrder ? (
        <section className="panel section-panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">Amendment mode</p>
              <h2 className="section-title serif">
                Editing unpaid order #{editOrder.orderNumber}
              </h2>
              <p className="supporting-copy">
                Adjust the ticket, then save the updated order before payment
                continues.
              </p>
            </div>
            <button
              className="secondary-button"
              onClick={() => {
                router.replace(`/outlets/${outletId}/pos`);
                setEditOrder(null);
                setResolvedEditMenuForOrderId(null);
              }}
              type="button"
            >
              Exit edit mode
            </button>
          </div>
        </section>
      ) : null}

      <section className="pos-layout">
        <section className="panel section-panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">Menu source</p>
              <h2 className="section-title serif">Build a walk-in order</h2>
              <p className="supporting-copy">
                Use published POS or BOTH menus. All totals are finally
                confirmed by the backend on submit.
              </p>
            </div>
            <div className="menu-toolbar">
              <select
                className="filter-select"
                onChange={(event) => setSelectedMenuId(event.target.value)}
                value={selectedMenuId}
              >
                <option value="">Select menu</option>
                {menus.map((menu) => (
                  <option key={menu.id} value={menu.id}>
                    {menu.name}
                    {menu.isDefault ? ' (Default)' : ''}
                  </option>
                ))}
              </select>
              <input
                className="filter-select"
                onChange={(event) => setMenuSearch(event.target.value)}
                placeholder="Search items, categories, or stations"
                value={menuSearch}
              />
            </div>
          </div>

          {detailLoading ? (
            <p className="supporting-copy">Loading menu detail...</p>
          ) : !publishedVersion ? (
            <div className="empty-state">
              <h3>No published POS menu ready</h3>
              <p className="supporting-copy">
                Publish a POS or BOTH menu in owner-web before using the staff
                composer.
              </p>
            </div>
          ) : (
            <div className="menu-sections">
              <div className="section-header">
                <p className="supporting-copy">
                  Showing {filteredItemCount} item
                  {filteredItemCount === 1 ? '' : 's'}
                  {menuSearch.trim() ? ` for "${menuSearch.trim()}"` : ''}.
                </p>
                {menuSearch.trim() ? (
                  <button
                    className="ghost-button"
                    onClick={() => setMenuSearch('')}
                    type="button"
                  >
                    Clear search
                  </button>
                ) : null}
              </div>

              {filteredCategories.length === 0 ? (
                <div className="empty-state">
                  <h3>No menu items match this search</h3>
                  <p className="supporting-copy">
                    Try a different keyword or clear the search to see the full
                    menu.
                  </p>
                </div>
              ) : null}

              {filteredCategories.map((category) => (
                  <section className="category-panel" key={category.id}>
                    <div className="section-header">
                      <div>
                        <h3>{category.name}</h3>
                        <p className="supporting-copy">
                          {category.items.filter((item) => item.active).length}{' '}
                          items
                        </p>
                      </div>
                    </div>
                    <div className="product-grid">
                      {category.items
                        .filter((item) => item.active)
                        .map((item) => {
                          const hasCustomization =
                            item.variants.some((variant) => variant.active) ||
                            item.itemModifierGroups.length > 0;
                          return (
                            <article className="product-card" key={item.id}>
                              <div className="section-header">
                                <div>
                                  <h4>{item.name}</h4>
                                  <p className="supporting-copy">
                                    {item.description || 'No description'}
                                  </p>
                                </div>
                                <span
                                  className={`status-pill ${
                                    item.soldOut ? 'danger' : 'success'
                                  }`}
                                >
                                  {item.soldOut ? 'Sold out' : 'Ready'}
                                </span>
                              </div>
                              <div className="queue-metrics">
                                <div className="metric-inline">
                                  <span>Base price</span>
                                  <strong>
                                    {formatMoney(
                                      outlet?.currency ?? 'SGD',
                                      item.basePriceCents,
                                    )}
                                  </strong>
                                </div>
                                <div className="metric-inline">
                                  <span>Prep station</span>
                                  <strong>
                                    {formatEnum(item.preparationStationKey)}
                                  </strong>
                                </div>
                              </div>
                              <div className="inline-actions">
                                <button
                                  className="primary-button"
                                  disabled={item.soldOut}
                                  onClick={() =>
                                    hasCustomization
                                      ? openCustomization(item)
                                      : addDirectItem(item)
                                  }
                                  type="button"
                                >
                                  {hasCustomization ? 'Customize' : 'Add'}
                                </button>
                              </div>
                            </article>
                          );
                        })}
                    </div>
                  </section>
                ))}
            </div>
          )}
        </section>

        <aside className="panel section-panel pos-sidebar">
          <p className="eyebrow">Order builder</p>
          <h2 className="section-title serif">Current ticket</h2>

          <div className="form-grid">
            <div className="field">
              <label htmlFor="source">Source</label>
              <select
                id="source"
                onChange={(event) =>
                  setSource(event.target.value as 'POS' | 'WAITER')
                }
                value={source}
              >
                <option value="POS">POS</option>
                <option value="WAITER">Waiter</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="serviceType">Service type</label>
              <select
                id="serviceType"
                onChange={(event) =>
                  setServiceType(event.target.value as StaffServiceType)
                }
                value={serviceType}
              >
                {serviceTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {serviceType === 'DINE_IN' ? (
              <div className="field">
                <label htmlFor="tableId">Table</label>
                <select
                  id="tableId"
                  onChange={(event) => setTableId(event.target.value)}
                  value={tableId}
                >
                  <option value="">Select table</option>
                  {availableTables.map((table) => (
                    <option key={table.id} value={table.id}>
                      {table.zoneName} | {table.displayName}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="field">
              <label htmlFor="customerName">Customer name</label>
              <input
                id="customerName"
                onChange={(event) => setCustomerName(event.target.value)}
                placeholder="Optional guest name"
                value={customerName}
              />
            </div>

            <div className="field">
              <label htmlFor="customerPhone">Customer phone</label>
              <input
                id="customerPhone"
                onChange={(event) => setCustomerPhone(event.target.value)}
                placeholder="Optional contact number"
                value={customerPhone}
              />
            </div>

            <div className="field">
              <label>Payment method</label>
              <div className="payment-choice-list">
                {paymentMethodOptions.map((option) => (
                  <button
                    className={
                      paymentMethod === option.value
                        ? 'payment-choice active'
                        : 'payment-choice'
                    }
                    key={option.value}
                    onClick={() => setPaymentMethod(option.value)}
                    type="button"
                  >
                    <strong>{option.label}</strong>
                    <span>{option.note}</span>
                  </button>
                ))}
              </div>
            </div>

            {paymentMethod === 'CASH' ? (
              <div className="field">
                <label htmlFor="cashTendered">Cash received</label>
                <div className="cash-entry-grid">
                  <input
                    id="cashTendered"
                    inputMode="decimal"
                    onChange={(event) => setCashTendered(event.target.value)}
                    placeholder={formatCurrencyInput(summary.grandTotalCents)}
                    value={cashTendered}
                  />
                  <button
                    className="secondary-button"
                    onClick={() =>
                      setCashTendered(formatCurrencyInput(summary.grandTotalCents))
                    }
                    type="button"
                  >
                    Exact cash
                  </button>
                </div>
                <div className="cash-summary-grid">
                  <div className="sub-panel">
                    <span className="metric-label">Tendered</span>
                    <strong>
                      {cashTenderedCents === null
                        ? '--'
                        : formatMoney(
                            outlet?.currency ?? 'SGD',
                            cashTenderedCents,
                          )}
                    </strong>
                  </div>
                  <div className="sub-panel">
                    <span className="metric-label">
                      {cashChangeDueCents !== null && cashChangeDueCents < 0
                        ? 'Still due'
                        : 'Change due'}
                    </span>
                    <strong>
                      {cashChangeDueCents === null
                        ? '--'
                        : formatMoney(
                            outlet?.currency ?? 'SGD',
                            Math.abs(cashChangeDueCents),
                          )}
                    </strong>
                  </div>
                </div>
                <p className="supporting-copy">
                  Enter the amount collected at the counter before finalizing
                  this cash sale.
                </p>
              </div>
            ) : null}
          </div>

          <div className="cart-list">
            {cart.length === 0 ? (
              <div className="empty-state">
                <h3>Cart is empty</h3>
                <p className="supporting-copy">
                  Add items from the published POS menu to begin the ticket.
                </p>
              </div>
            ) : (
              cart.map((item) => (
                <article className="cart-card" key={item.id}>
                  <div className="section-header">
                    <div>
                      <strong>{item.itemName}</strong>
                      <p className="supporting-copy">
                        {item.variantName ? `${item.variantName} | ` : ''}
                        {item.modifierLabels.join(', ') || 'No modifiers'}
                      </p>
                      {item.remarks ? (
                        <p className="supporting-copy">Note: {item.remarks}</p>
                      ) : null}
                    </div>
                    <strong>
                      {formatMoney(
                        outlet?.currency ?? 'SGD',
                        item.lineTotalCents,
                      )}
                    </strong>
                  </div>
                  <div className="inline-actions">
                    <button
                      className="quantity-button"
                      onClick={() => updateCartQuantity(item.id, -1)}
                      type="button"
                    >
                      -
                    </button>
                    <span className="quantity-value">{item.quantity}</span>
                    <button
                      className="quantity-button"
                      onClick={() => updateCartQuantity(item.id, 1)}
                      type="button"
                    >
                      +
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() => startEditingCartItem(item)}
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      className="ghost-button"
                      onClick={() => removeCartItem(item.id)}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>

          <article className="sub-panel bill-card">
            <h3>Estimated totals</h3>
            <div className="stack-list">
              <div className="stack-row">
                <span>Subtotal</span>
                <strong>
                  {formatMoney(
                    outlet?.currency ?? 'SGD',
                    summary.subtotalCents,
                  )}
                </strong>
              </div>
              <div className="stack-row">
                <span>Service charge</span>
                <strong>
                  {formatMoney(
                    outlet?.currency ?? 'SGD',
                    summary.serviceChargeTotalCents,
                  )}
                </strong>
              </div>
              <div className="stack-row">
                <span>GST</span>
                <strong>
                  {formatMoney(
                    outlet?.currency ?? 'SGD',
                    summary.gstTotalCents,
                  )}
                </strong>
              </div>
              <div className="stack-row">
                <span>Total</span>
                <strong>
                  {formatMoney(
                    outlet?.currency ?? 'SGD',
                    summary.grandTotalCents,
                  )}
                </strong>
              </div>
            </div>
            <p className="supporting-copy">
              Final totals are confirmed by the backend when the order is saved.
            </p>
          </article>

          <button
            className="primary-button full-width"
            disabled={submitDisabled}
            onClick={() => void submitOrder()}
            type="button"
          >
            {submitting
              ? editOrder
                ? 'Saving changes...'
                : 'Creating order...'
              : editOrder
                ? 'Save order changes'
                : 'Create staff order'}
          </button>
        </aside>
      </section>

      {customizing ? (
        <section className="panel section-panel customization-panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">
                {customizing.editingCartItemId ? 'Edit cart line' : 'Customize item'}
              </p>
              <h2 className="section-title serif">{customizing.item.name}</h2>
              <p className="supporting-copy">
                {customizing.editingCartItemId
                  ? 'Update the quantity, remarks, variants, or modifiers for this line.'
                  : 'Set the quantity, modifiers, and remarks before adding this line.'}
              </p>
            </div>
            <button
              className="ghost-button"
              onClick={() => setCustomizing(null)}
              type="button"
            >
              Close
            </button>
          </div>

          <div className="form-grid">
            {customizing.item.variants.filter((variant) => variant.active)
              .length ? (
              <div className="field">
                <label>Variant</label>
                <div className="choice-grid">
                  {customizing.item.variants
                    .filter((variant) => variant.active)
                    .map((variant) => (
                      <button
                        className={
                          customizing.variantId === variant.id
                            ? 'choice-chip active'
                            : 'choice-chip'
                        }
                        key={variant.id}
                        onClick={() =>
                          setCustomizing((current) =>
                            current
                              ? {
                                  ...current,
                                  variantId: variant.id,
                                  error: null,
                                }
                              : current,
                          )
                        }
                        type="button"
                      >
                        {variant.name}
                        <small>
                          {variant.priceDeltaCents
                            ? `+${formatMoney(
                                outlet?.currency ?? 'SGD',
                                variant.priceDeltaCents,
                              )}`
                            : 'Included'}
                        </small>
                      </button>
                    ))}
                </div>
              </div>
            ) : null}

            {customizing.item.itemModifierGroups.length
              ? customizing.item.itemModifierGroups.map((entry) => {
                  const group = entry.modifierGroup;
                  const selected =
                    customizing.modifierSelections[group.id] ?? [];
                  return (
                    <div className="field" key={group.id}>
                      <label>
                        {group.name} ({group.minSelect}-{group.maxSelect})
                      </label>
                      <div className="choice-grid">
                        {group.options
                          .filter((option) => option.active)
                          .map((option) => {
                            const isSelected = selected.includes(option.id);
                            return (
                              <button
                                className={
                                  isSelected
                                    ? 'choice-chip active'
                                    : 'choice-chip'
                                }
                                key={option.id}
                                onClick={() =>
                                  setCustomizing((current) => {
                                    if (!current) {
                                      return current;
                                    }
                                    const existing =
                                      current.modifierSelections[group.id] ??
                                      [];
                                    const next = isSelected
                                      ? existing.filter(
                                          (id) => id !== option.id,
                                        )
                                      : [...existing, option.id];
                                    return {
                                      ...current,
                                      modifierSelections: {
                                        ...current.modifierSelections,
                                        [group.id]: next,
                                      },
                                      error: null,
                                    };
                                  })
                                }
                                type="button"
                              >
                                {option.name}
                                <small>
                                  {option.priceDeltaCents
                                    ? `+${formatMoney(
                                        outlet?.currency ?? 'SGD',
                                        option.priceDeltaCents,
                                      )}`
                                    : 'Included'}
                                </small>
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  );
                })
              : null}

            <div className="field">
              <label htmlFor="customQuantity">Quantity</label>
              <input
                id="customQuantity"
                max={99}
                min={1}
                onChange={(event) =>
                  setCustomizing((current) =>
                    current
                      ? {
                          ...current,
                          quantity: Math.max(
                            1,
                            Number.parseInt(event.target.value || '1', 10),
                          ),
                        }
                      : current,
                  )
                }
                type="number"
                value={customizing.quantity}
              />
            </div>

            <div className="field">
              <label htmlFor="customRemarks">Remarks</label>
              <textarea
                id="customRemarks"
                onChange={(event) =>
                  setCustomizing((current) =>
                    current
                      ? { ...current, remarks: event.target.value, error: null }
                      : current,
                  )
                }
                rows={3}
                value={customizing.remarks}
              />
            </div>

            {customizing.error ? (
              <div className="alert error">{customizing.error}</div>
            ) : null}

            <div className="inline-actions">
              <button
                className="primary-button"
                onClick={commitCustomization}
                type="button"
              >
                {customizing.editingCartItemId ? 'Update cart item' : 'Add to cart'}
              </button>
              <button
                className="secondary-button"
                onClick={() => setCustomizing(null)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </OutletPageLayout>
  );
}

function estimateTotals(outlet: OutletSummary | null, cart: CartItem[]) {
  const subtotalCents = cart.reduce(
    (sum, item) => sum + item.lineTotalCents,
    0,
  );
  const serviceChargeTotalCents =
    outlet?.serviceChargeEnabled && outlet.serviceChargeBps
      ? Math.round((subtotalCents * outlet.serviceChargeBps) / 10000)
      : 0;
  const taxableBase = subtotalCents + serviceChargeTotalCents;
  const gstTotalCents =
    outlet?.gstEnabled && outlet.gstRateBps
      ? Math.round((taxableBase * outlet.gstRateBps) / 10000)
      : 0;
  return {
    subtotalCents,
    serviceChargeTotalCents,
    gstTotalCents,
    grandTotalCents: subtotalCents + serviceChargeTotalCents + gstTotalCents,
  };
}

function validateCustomization(draft: DraftCustomization) {
  for (const entry of draft.item.itemModifierGroups) {
    const group = entry.modifierGroup;
    const selected = draft.modifierSelections[group.id] ?? [];
    if (
      selected.length < group.minSelect ||
      selected.length > group.maxSelect
    ) {
      return `${group.name} requires ${group.minSelect}-${group.maxSelect} selections.`;
    }
  }
  return null;
}

function buildCartItem(draft: DraftCustomization): CartItem {
  const variant = draft.item.variants.find(
    (entry) => entry.id === draft.variantId && entry.active,
  );
  const selectedOptions = draft.item.itemModifierGroups.flatMap((entry) => {
    const selected = draft.modifierSelections[entry.modifierGroup.id] ?? [];
    return entry.modifierGroup.options.filter(
      (option) => option.active && selected.includes(option.id),
    );
  });
  const modifierTotal = selectedOptions.reduce(
    (sum, option) => sum + option.priceDeltaCents,
    0,
  );
  const unitPriceCents =
    draft.item.basePriceCents + (variant?.priceDeltaCents ?? 0) + modifierTotal;
  return {
    id: createLocalId(),
    menuItemId: draft.item.id,
    itemName: draft.item.name,
    variantId: variant?.id,
    variantName: variant?.name,
    quantity: draft.quantity,
    remarks: draft.remarks.trim(),
    modifierOptionIds: selectedOptions.map((option) => option.id),
    modifierLabels: selectedOptions.map((option) => option.name),
    unitPriceCents,
    lineTotalCents: unitPriceCents * draft.quantity,
  };
}

function mapOrderItemToCartItem(item: OrderDetail['items'][number]): CartItem {
  return {
    id: createLocalId(),
    menuItemId: item.menuItemId ?? '',
    itemName: item.itemName,
    variantId: item.variantId ?? undefined,
    variantName: item.variantName ?? undefined,
    quantity: item.quantity,
    remarks: item.remarks ?? '',
    modifierOptionIds: item.modifiers
      .map((modifier) => modifier.modifierOptionId)
      .filter((modifierId): modifierId is string => Boolean(modifierId)),
    modifierLabels: item.modifiers.map(
      (modifier) => modifier.modifierOptionName,
    ),
    unitPriceCents: item.unitPriceCents,
    lineTotalCents: item.lineTotalCents,
  };
}

function formatMoney(currency: string, cents: number) {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function parseCurrencyInputToCents(value: string) {
  const normalized = value.replace(/[^0-9.]/g, '').trim();
  if (!normalized) {
    return null;
  }
  const parsed = Number.parseFloat(normalized);
  if (Number.isNaN(parsed) || parsed < 0) {
    return null;
  }
  return Math.round(parsed * 100);
}

function formatCurrencyInput(cents: number) {
  return (cents / 100).toFixed(2);
}

function formatEnum(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function createIdempotencyKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `staff-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createLocalId() {
  return `cart-${createIdempotencyKey()}`;
}
