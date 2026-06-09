'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import {
  cloneMenuDraft,
  getMenuDetail,
  getMenus,
  getOutletAuditLogs,
  publishMenu,
  replaceMenuDraft,
  setMenuItemSoldOut,
} from '@/lib/api';
import { OutletAuditFeed } from '@/components/outlet-audit-feed';
import { createOperationsSocket, outletOperationsEvents } from '@/lib/realtime';
import type {
  MenuListEntry,
  OutletAuditLogEntry,
  RealtimeStatus,
  ReplaceMenuDraftInput,
  StaffMenuDetail,
} from '@/lib/types';
import {
  OutletHeader,
  OutletPageLayout,
  useOutletContext,
} from './outlet-page-base';

type ItemVisibilityFilter = 'ALL' | 'AVAILABLE' | 'SOLD_OUT';

type QuickCategoryMode = 'EXISTING' | 'NEW';
type QuickDraftContent = {
  modifierGroups: NonNullable<ReplaceMenuDraftInput['modifierGroups']>;
  categories: ReplaceMenuDraftInput['categories'];
};

type QuickDraftCategory = QuickDraftContent['categories'][number];
type QuickDraftItem = QuickDraftCategory['items'][number];
type QuickDraftVariant = NonNullable<QuickDraftItem['variants']>[number];
type QuickDraftModifierGroup = QuickDraftContent['modifierGroups'][number];
type QuickDraftModifierOption = QuickDraftModifierGroup['options'][number];
type QuickEditableCategory = QuickDraftCategory & { id?: string };
type QuickAddItemInput = {
  quickCategoryMode: QuickCategoryMode;
  quickCategoryId: string;
  quickCategoryName: string;
  quickItemName: string;
  quickItemPriceCents: number;
  quickItemSku: string;
  quickItemDescription: string;
  quickItemStation: string;
  quickItemTaxable: boolean;
  quickItemServiceChargeable: boolean;
  quickItemActive: boolean;
};

export function OutletMenusPage() {
  const {
    session,
    outlet,
    outletId,
    error: outletError,
    busy: outletBusy,
  } = useOutletContext();
  const [menus, setMenus] = useState<MenuListEntry[]>([]);
  const [selectedMenuId, setSelectedMenuId] = useState('');
  const [menuDetail, setMenuDetail] = useState<StaffMenuDetail | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [visibilityFilter, setVisibilityFilter] =
    useState<ItemVisibilityFilter>('ALL');
  const [busy, setBusy] = useState(true);
  const [detailBusy, setDetailBusy] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [auditEntries, setAuditEntries] = useState<OutletAuditLogEntry[]>([]);
  const [status, setStatus] = useState<RealtimeStatus>('idle');
  const [quickCategoryMode, setQuickCategoryMode] =
    useState<QuickCategoryMode>('EXISTING');
  const [quickCategoryId, setQuickCategoryId] = useState('');
  const [quickCategoryName, setQuickCategoryName] = useState('');
  const [quickItemName, setQuickItemName] = useState('');
  const [quickItemPrice, setQuickItemPrice] = useState('');
  const [quickItemSku, setQuickItemSku] = useState('');
  const [quickItemDescription, setQuickItemDescription] = useState('');
  const [quickItemStation, setQuickItemStation] = useState('main-kitchen');
  const [quickItemTaxable, setQuickItemTaxable] = useState(true);
  const [quickItemServiceChargeable, setQuickItemServiceChargeable] =
    useState(true);
  const [quickItemActive, setQuickItemActive] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const outletAccess = useMemo(
    () => session?.user.outlets.find((entry) => entry.id === outletId) ?? null,
    [outletId, session],
  );
  const canReadMenus = outletAccess?.permissions.includes('menu.read') ?? false;
  const canManageMenus =
    outletAccess?.permissions.includes('menu.manage') ?? false;
  const canPublishMenus =
    outletAccess?.permissions.includes('menu.publish') ?? false;
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
    if (!session?.accessToken || !outletId || !canReadMenus) {
      setMenus([]);
      setMenuDetail(null);
      return;
    }

    const authToken = session.accessToken;
    let cancelled = false;

    async function loadMenus() {
      setBusy(true);
      setStatus('connecting');
      setError(null);
      try {
        const [result, audit] = await Promise.all([
          getMenus(authToken, outletId),
          getOutletAuditLogs(authToken, outletId, { limit: 30 }),
        ]);
        if (!cancelled) {
          setMenus(result);
          setAuditEntries(
            audit.entries.filter((entry) =>
              entry.actionType.startsWith('MENU_'),
            ),
          );
          setSelectedMenuId((current) =>
            current && result.some((menu) => menu.id === current)
              ? current
              : (result[0]?.id ?? ''),
          );
          setStatus('connected');
        }
      } catch (loadError) {
        if (!cancelled) {
          setStatus('error');
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Menus failed to load.',
          );
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
        }
      }
    }

    void loadMenus();
    return () => {
      cancelled = true;
    };
  }, [canReadMenus, outletId, refreshTick, session]);

  useEffect(() => {
    if (!session?.accessToken || !outletId || !canReadMenus) {
      setStatus('idle');
      return;
    }

    const socket = createOperationsSocket(session.accessToken);
    const subscribeToOutlet = () => {
      socket.emit('subscribe.outlet', { outletId }, () => {
        setStatus('connected');
      });
    };
    const handleConnect = () => {
      setStatus('connecting');
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', () => setStatus('offline'));
    socket.on('connect_error', () => setStatus('error'));
    socket.on('operations.connected', subscribeToOutlet);
    for (const eventName of outletOperationsEvents) {
      socket.on(eventName, queueRefresh);
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
  }, [canReadMenus, outletId, queueRefresh, session]);

  useEffect(() => {
    if (!session?.accessToken || !outletId || !selectedMenuId || !canReadMenus) {
      setMenuDetail(null);
      return;
    }

    const authToken = session.accessToken;
    let cancelled = false;

    async function loadMenuDetail() {
      setDetailBusy(true);
      setError(null);
      try {
        const result = await getMenuDetail(authToken, outletId, selectedMenuId);
        if (!cancelled) {
          setMenuDetail(result);
          setSelectedVersionId((current) =>
            current && result.versions.some((version) => version.id === current)
              ? current
              : resolveDefaultVersionId(result),
          );
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
          setDetailBusy(false);
        }
      }
    }

    void loadMenuDetail();
    return () => {
      cancelled = true;
    };
  }, [canReadMenus, outletId, refreshTick, selectedMenuId, session]);

  const selectedVersion =
    menuDetail?.versions.find((version) => version.id === selectedVersionId) ??
    null;
  const editableVersion = menuDetail
    ? menuDetail.versions.find((version) => version.status === 'DRAFT') ??
      menuDetail.versions.find((version) => version.status === 'PUBLISHED') ??
      menuDetail.versions[0] ??
      null
    : null;

  useEffect(() => {
    if (quickCategoryMode !== 'EXISTING') {
      return;
    }
    const categories = editableVersion?.categories ?? [];
    if (categories.length === 0) {
      setQuickCategoryId('');
      return;
    }
    if (
      quickCategoryId &&
      categories.some((category) => category.id === quickCategoryId)
    ) {
      return;
    }
    setQuickCategoryId(categories[0]?.id ?? '');
  }, [editableVersion, quickCategoryId, quickCategoryMode]);

  const filteredCategories = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return (
      selectedVersion?.categories
        .map((category) => ({
          ...category,
          items: category.items.filter((item) => {
            if (visibilityFilter === 'AVAILABLE' && item.soldOut) {
              return false;
            }
            if (visibilityFilter === 'SOLD_OUT' && !item.soldOut) {
              return false;
            }
            if (!normalizedSearch) {
              return true;
            }
            const haystack = [
              category.name,
              item.name,
              item.sku,
              item.description,
              item.preparationStationKey,
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();
            return haystack.includes(normalizedSearch);
          }),
        }))
        .filter((category) => category.items.length > 0) ?? []
    );
  }, [searchTerm, selectedVersion, visibilityFilter]);

  const itemSummary = {
    total: selectedVersion?.categories.flatMap((category) => category.items).length ?? 0,
    soldOut:
      selectedVersion?.categories
        .flatMap((category) => category.items)
        .filter((item) => item.soldOut).length ?? 0,
  };
  const categoryCount = selectedVersion?.categories.length ?? 0;
  const readyItems = Math.max(itemSummary.total - itemSummary.soldOut, 0);

  async function handleCloneDraft() {
    if (!session?.accessToken || !outletId || !selectedMenuId) {
      return;
    }
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'Clone the current published menu into a new draft for editing?',
      )
    ) {
      return;
    }
    setActionBusyId('clone-draft');
    setError(null);
    try {
      const result = await cloneMenuDraft(
        session.accessToken,
        outletId,
        selectedMenuId,
      );
      setMenuDetail(result);
      setSelectedVersionId(resolveDefaultVersionId(result));
      setMenus((current) =>
        current.map((menu) =>
          menu.id === result.id
            ? {
                ...menu,
                status: result.status,
                versions: result.versions.map((version) => ({
                  id: version.id,
                  versionNumber: version.versionNumber,
                  status: version.status,
                  publishedAt: version.publishedAt,
                  updatedAt: version.updatedAt,
                })),
              }
            : menu,
        ),
      );
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'Failed to clone menu draft.',
      );
    } finally {
      setActionBusyId(null);
    }
  }

  async function handlePublish() {
    if (!session?.accessToken || !outletId || !selectedMenuId) {
      return;
    }
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'Publish this draft now? The current published version will be replaced for the outlet.',
      )
    ) {
      return;
    }
    setActionBusyId('publish-menu');
    setError(null);
    try {
      const result = await publishMenu(
        session.accessToken,
        outletId,
        selectedMenuId,
      );
      setMenuDetail(result);
      setSelectedVersionId(resolveDefaultVersionId(result));
      setMenus((current) =>
        current.map((menu) =>
          menu.id === result.id
            ? {
                ...menu,
                status: result.status,
                versions: result.versions.map((version) => ({
                  id: version.id,
                  versionNumber: version.versionNumber,
                  status: version.status,
                  publishedAt: version.publishedAt,
                  updatedAt: version.updatedAt,
                })),
              }
            : menu,
        ),
      );
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'Failed to publish menu.',
      );
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleToggleSoldOut(
    itemId: string,
    currentSoldOut: boolean,
    itemName: string,
  ) {
    if (!session?.accessToken || !outletId || !menuDetail) {
      return;
    }
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        currentSoldOut
          ? `Return ${itemName} to sale for customers and staff ordering?`
          : `Mark ${itemName} as sold out for the outlet right now?`,
      )
    ) {
      return;
    }
    setActionBusyId(itemId);
    setError(null);
    try {
      const result = await setMenuItemSoldOut(session.accessToken, outletId, itemId, {
        soldOut: !currentSoldOut,
        reason: currentSoldOut
          ? `Staff returned ${itemName} to sale from menu operations.`
          : `Staff marked ${itemName} sold out from menu operations.`,
      });
      setMenuDetail((current) =>
        current
          ? {
              ...current,
              versions: current.versions.map((version) => ({
                ...version,
                categories: version.categories.map((category) => ({
                  ...category,
                  items: category.items.map((item) =>
                    item.id === result.id
                      ? { ...item, soldOut: result.soldOut }
                      : item,
                  ),
                })),
              })),
            }
          : current,
      );
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'Failed to update sold-out status.',
      );
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleQuickAddItem() {
    if (!session?.accessToken || !outletId || !menuDetail || !editableVersion) {
      return;
    }

    if (editableVersion.status !== 'DRAFT') {
      setError(
        'Create a draft first before adding items. Clone the published menu into a draft, then try again.',
      );
      return;
    }

    const itemName = quickItemName.trim();
    const categoryName = quickCategoryName.trim();
    const priceCents = parseCurrencyToCents(quickItemPrice);
    if (!itemName) {
      setError('Enter an item name before saving to the draft.');
      return;
    }
    if (priceCents === null || priceCents < 0) {
      setError('Enter a valid item price before saving to the draft.');
      return;
    }
    if (quickCategoryMode === 'EXISTING' && !quickCategoryId) {
      setError('Choose an existing category or switch to creating a new one.');
      return;
    }
    if (quickCategoryMode === 'NEW' && !categoryName) {
      setError('Enter a new category name before saving to the draft.');
      return;
    }
    if (
      quickCategoryMode === 'NEW' &&
      editableVersion.categories.some(
        (category) =>
          category.name.trim().toLowerCase() === categoryName.toLowerCase(),
      )
    ) {
      setError(
        'That category already exists in this draft. Choose it from the list instead of creating a duplicate.',
      );
      return;
    }

    const payload = buildQuickDraftPayload(menuDetail, editableVersion, {
      quickCategoryMode,
      quickCategoryId,
      quickCategoryName: categoryName,
      quickItemName: itemName,
      quickItemPriceCents: priceCents,
      quickItemSku: quickItemSku.trim(),
      quickItemDescription: quickItemDescription.trim(),
      quickItemStation: quickItemStation.trim() || 'main-kitchen',
      quickItemTaxable,
      quickItemServiceChargeable,
      quickItemActive,
    });

    setActionBusyId('quick-add-item');
    setError(null);
    try {
      const result = await replaceMenuDraft(
        session.accessToken,
        outletId,
        menuDetail.id,
        payload,
      );
      setMenuDetail(result);
      setSelectedVersionId(resolveDefaultVersionId(result));
      setQuickItemName('');
      setQuickItemPrice('');
      setQuickItemSku('');
      setQuickItemDescription('');
      setQuickItemStation('main-kitchen');
      setQuickItemTaxable(true);
      setQuickItemServiceChargeable(true);
      setQuickItemActive(true);
      if (quickCategoryMode === 'NEW') {
        const createdCategory = result.versions
          .find((version) => version.status === 'DRAFT')
          ?.categories.find(
            (category) =>
              category.name.trim().toLowerCase() === categoryName.toLowerCase(),
          );
        setQuickCategoryMode('EXISTING');
        setQuickCategoryId(createdCategory?.id ?? '');
        setQuickCategoryName('');
      }
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'Failed to save the quick item to the draft.',
      );
    } finally {
      setActionBusyId(null);
    }
  }

  const hasDraft =
    menuDetail?.versions.some((version) => version.status === 'DRAFT') ?? false;
  const hasPublished =
    menuDetail?.versions.some((version) => version.status === 'PUBLISHED') ?? false;

  return (
    <OutletPageLayout
      title="Menu operations"
      subtitle="Review live outlet menus, monitor sold-out coverage, and control service availability without leaving the staff console."
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

      {!canReadMenus ? (
        <section className="panel section-panel">
          <div className="empty-state">
            <h3>Menu access is unavailable</h3>
            <p className="supporting-copy">
              This staff session does not currently include menu read access for
              the selected outlet.
            </p>
          </div>
        </section>
      ) : (
        <>
          <section className="workspace-hero workspace-hero--staff">
            <div className="workspace-hero__header">
              <div className="workspace-hero__copy">
                <p className="eyebrow">Menu quick edit</p>
                <h2 className="section-title serif">Keep service-ready items current</h2>
                <p className="supporting-copy">
                  This menu board now supports fast staff-side menu operations:
                  spot sold-out items, clone a draft, add a missing item, and
                  publish when your role allows it.
                </p>
              </div>
              <div className="workspace-pill-grid">
                <div className="workspace-pill current">
                  <span>Realtime</span>
                  <strong>{formatRealtimeStatus(status)}</strong>
                </div>
                <div className="workspace-pill">
                  <span>Edit mode</span>
                  <strong>
                    {hasDraft ? 'Draft available' : hasPublished ? 'Published only' : 'First setup'}
                  </strong>
                </div>
              </div>
            </div>
            <div className="operations-summary-grid">
              <article className="operations-summary-card">
                <span className="metric-label">Menus</span>
                <strong>{menus.length}</strong>
                <p className="supporting-copy">
                  Menu records currently available for this outlet.
                </p>
              </article>
              <article className="operations-summary-card">
                <span className="metric-label">Categories</span>
                <strong>{categoryCount}</strong>
                <p className="supporting-copy">
                  Visible categories in the selected menu version.
                </p>
              </article>
              <article className="operations-summary-card">
                <span className="metric-label">Ready to sell</span>
                <strong>{readyItems}</strong>
                <p className="supporting-copy">
                  Available items after sold-out filtering is applied.
                </p>
              </article>
              <article className="operations-summary-card">
                <span className="metric-label">Sold out</span>
                <strong>{itemSummary.soldOut}</strong>
                <p className="supporting-copy">
                  Items currently hidden from customer and staff ordering.
                </p>
              </article>
            </div>
          </section>

          <section className="metric-board">
            <article className="panel metric-card">
              <span className="metric-label">Menus</span>
              <strong className="metric-value">{menus.length}</strong>
            </article>
            <article className="panel metric-card">
              <span className="metric-label">Items in view</span>
              <strong className="metric-value">{itemSummary.total}</strong>
            </article>
            <article className="panel metric-card">
              <span className="metric-label">Sold out</span>
              <strong className="metric-value">{itemSummary.soldOut}</strong>
            </article>
            <article className="panel metric-card">
              <span className="metric-label">Menu state</span>
              <strong className="metric-value">{formatRealtimeStatus(status)}</strong>
            </article>
          </section>

          <section className="panel section-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Live menu board</p>
                <h2 className="section-title serif">Outlet menu controls</h2>
                <p className="supporting-copy">
                  Choose a menu, review the current draft or published version,
                  and adjust sold-out state at item level. Staff with menu
                  permissions can also use the quick editor below.
                </p>
              </div>
              <div className="inline-actions">
                <button
                  className="secondary-button"
                  disabled={busy || detailBusy}
                  onClick={() => setRefreshTick((current) => current + 1)}
                  type="button"
                >
                  {busy || detailBusy ? 'Refreshing...' : 'Refresh menu state'}
                </button>
                {canManageMenus && hasPublished && !hasDraft ? (
                  <button
                    className="secondary-button"
                    disabled={actionBusyId === 'clone-draft'}
                    onClick={() => void handleCloneDraft()}
                    type="button"
                  >
                    {actionBusyId === 'clone-draft'
                      ? 'Cloning draft...'
                      : 'Clone published into draft'}
                  </button>
                ) : null}
                {canPublishMenus && hasDraft ? (
                  <button
                    className="primary-button"
                    disabled={actionBusyId === 'publish-menu'}
                    onClick={() => void handlePublish()}
                    type="button"
                  >
                    {actionBusyId === 'publish-menu'
                      ? 'Publishing...'
                      : 'Publish draft'}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="form-grid">
              <div className="field">
                <label htmlFor="menu-select">Menu</label>
                <select
                  id="menu-select"
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
              </div>
              <div className="field">
                <label htmlFor="version-select">Version</label>
                <select
                  disabled={!menuDetail}
                  id="version-select"
                  onChange={(event) => setSelectedVersionId(event.target.value)}
                  value={selectedVersionId}
                >
                  {menuDetail?.versions.map((version) => (
                    <option key={version.id} value={version.id}>
                      V{version.versionNumber} • {formatEnum(version.status)}
                    </option>
                  )) ?? <option value="">Select version</option>}
                </select>
              </div>
              <div className="field">
                <label htmlFor="menu-search">Search items</label>
                <input
                  id="menu-search"
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search by category, item, SKU, station, or description"
                  value={searchTerm}
                />
              </div>
              <div className="field">
                <label htmlFor="sold-out-filter">Item visibility</label>
                <select
                  id="sold-out-filter"
                  onChange={(event) =>
                    setVisibilityFilter(event.target.value as ItemVisibilityFilter)
                  }
                  value={visibilityFilter}
                >
                  <option value="ALL">All items</option>
                  <option value="AVAILABLE">Available only</option>
                  <option value="SOLD_OUT">Sold out only</option>
                </select>
              </div>
            </div>
          </section>

          {canManageMenus ? (
            <section className="panel section-panel queue-card--upgraded">
              <div className="section-header">
                <div>
                  <p className="eyebrow">Quick edit</p>
                  <h2 className="section-title serif">Add an item without leaving service</h2>
                  <p className="supporting-copy">
                    Inspired by the fastest restaurant POS edit flows: make a
                    draft, add a category or item, save, then publish when
                    ready.
                  </p>
                </div>
                <span
                  className={`status-pill ${
                    editableVersion?.status === 'DRAFT' ? 'success' : 'warning'
                  }`}
                >
                  {editableVersion?.status === 'DRAFT'
                    ? 'Draft editing live'
                    : 'Draft required'}
                </span>
              </div>

              <div className="form-grid">
                <div className="field">
                  <label htmlFor="quick-category-mode">Target category</label>
                  <select
                    id="quick-category-mode"
                    onChange={(event) =>
                      setQuickCategoryMode(event.target.value as QuickCategoryMode)
                    }
                    value={quickCategoryMode}
                  >
                    <option value="EXISTING">Use existing category</option>
                    <option value="NEW">Create new category</option>
                  </select>
                </div>
                {quickCategoryMode === 'EXISTING' ? (
                  <div className="field">
                    <label htmlFor="quick-category-id">Category</label>
                    <select
                      id="quick-category-id"
                      onChange={(event) => setQuickCategoryId(event.target.value)}
                      value={quickCategoryId}
                    >
                      <option value="">Select category</option>
                      {(editableVersion?.categories ?? []).map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="field">
                    <label htmlFor="quick-category-name">New category name</label>
                    <input
                      id="quick-category-name"
                      onChange={(event) => setQuickCategoryName(event.target.value)}
                      placeholder="Seasonal specials"
                      value={quickCategoryName}
                    />
                  </div>
                )}
                <div className="field">
                  <label htmlFor="quick-item-name">Item name</label>
                  <input
                    id="quick-item-name"
                    onChange={(event) => setQuickItemName(event.target.value)}
                    placeholder="Grilled seabass"
                    value={quickItemName}
                  />
                </div>
                <div className="field">
                  <label htmlFor="quick-item-price">Price</label>
                  <input
                    id="quick-item-price"
                    inputMode="decimal"
                    onChange={(event) => setQuickItemPrice(event.target.value)}
                    placeholder="18.90"
                    value={quickItemPrice}
                  />
                </div>
                <div className="field">
                  <label htmlFor="quick-item-sku">SKU</label>
                  <input
                    id="quick-item-sku"
                    onChange={(event) => setQuickItemSku(event.target.value)}
                    placeholder="FISH-SEA-001"
                    value={quickItemSku}
                  />
                </div>
                <div className="field">
                  <label htmlFor="quick-item-station">Prep station</label>
                  <input
                    id="quick-item-station"
                    onChange={(event) => setQuickItemStation(event.target.value)}
                    placeholder="main-kitchen"
                    value={quickItemStation}
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="quick-item-description">Description</label>
                <textarea
                  id="quick-item-description"
                  onChange={(event) => setQuickItemDescription(event.target.value)}
                  placeholder="Short staff-friendly or guest-facing description"
                  rows={3}
                  value={quickItemDescription}
                />
              </div>

              <div className="inline-actions">
                <label className="checkbox-row">
                  <input
                    checked={quickItemTaxable}
                    onChange={(event) => setQuickItemTaxable(event.target.checked)}
                    type="checkbox"
                  />
                  <span>Taxable</span>
                </label>
                <label className="checkbox-row">
                  <input
                    checked={quickItemServiceChargeable}
                    onChange={(event) =>
                      setQuickItemServiceChargeable(event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>Service chargeable</span>
                </label>
                <label className="checkbox-row">
                  <input
                    checked={quickItemActive}
                    onChange={(event) => setQuickItemActive(event.target.checked)}
                    type="checkbox"
                  />
                  <span>Visible in menu</span>
                </label>
              </div>

              <div className="inline-actions">
                <button
                  className="primary-button"
                  disabled={actionBusyId === 'quick-add-item'}
                  onClick={() => void handleQuickAddItem()}
                  type="button"
                >
                  {actionBusyId === 'quick-add-item'
                    ? 'Saving to draft...'
                    : 'Add item to draft'}
                </button>
                <span className="supporting-copy">
                  {editableVersion?.status === 'DRAFT'
                    ? 'Saves directly into the current draft version.'
                    : 'Clone a published menu into a draft first, then quick add items here.'}
                </span>
              </div>
            </section>
          ) : null}

          {busy ? (
            <section className="panel section-panel">
              <p className="supporting-copy">Loading menus...</p>
            </section>
          ) : menus.length === 0 ? (
            <section className="panel section-panel">
              <div className="empty-state">
                <h3>No menus available</h3>
                <p className="supporting-copy">
                  Configure or publish a menu before using staff menu operations.
                </p>
              </div>
            </section>
          ) : detailBusy ? (
            <section className="panel section-panel">
              <p className="supporting-copy">Loading menu detail...</p>
            </section>
          ) : !menuDetail || !selectedVersion ? (
            <section className="panel section-panel">
              <div className="empty-state">
                <h3>Select a menu version</h3>
                <p className="supporting-copy">
                  Choose a menu to inspect its categories, items, and service
                  state.
                </p>
              </div>
            </section>
          ) : filteredCategories.length === 0 ? (
            <section className="panel section-panel">
              <div className="empty-state">
                <h3>No matching items</h3>
                <p className="supporting-copy">
                  Clear the search or broaden the visibility filter to bring menu
                  items back into view.
                </p>
              </div>
            </section>
          ) : (
            <section className="zones-grid">
              {filteredCategories.map((category) => (
                <article className="panel section-panel" key={category.id}>
                  <div className="section-header">
                    <div>
                      <p className="eyebrow">Category</p>
                      <h2 className="section-title serif">{category.name}</h2>
                      <p className="supporting-copy">
                        {category.items.length} item
                        {category.items.length === 1 ? '' : 's'} in view
                      </p>
                    </div>
                    <span
                      className={`status-pill ${
                        category.active ? 'success' : 'neutral'
                      }`}
                    >
                      {category.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="stack-list">
                    {category.items.map((item) => (
                      <div className="stack-row" key={item.id}>
                        <div>
                          <strong>{item.name}</strong>
                          <p className="supporting-copy">
                            {item.sku ?? 'No SKU'} |{' '}
                            {formatMoney(outlet?.currency ?? 'SGD', item.basePriceCents)} |
                            {' '}{item.preparationStationKey}
                          </p>
                          {item.description ? (
                            <p className="supporting-copy">{item.description}</p>
                          ) : null}
                          <p className="supporting-copy">
                            Variants: {item.variants.length} | Modifier groups:{' '}
                            {item.itemModifierGroups.length}
                          </p>
                        </div>
                        <div className="inline-actions">
                          <span
                            className={`status-pill ${
                              item.soldOut ? 'danger' : 'success'
                            }`}
                          >
                            {item.soldOut ? 'Sold out' : 'Available'}
                          </span>
                          {canManageMenus ? (
                            <button
                              className={
                                item.soldOut ? 'secondary-button' : 'primary-button'
                              }
                              disabled={actionBusyId === item.id}
                              onClick={() =>
                                void handleToggleSoldOut(
                                  item.id,
                                  item.soldOut,
                                  item.name,
                                )
                              }
                              type="button"
                            >
                              {actionBusyId === item.id
                                ? 'Updating...'
                                : item.soldOut
                                  ? 'Return to sale'
                                  : 'Mark sold out'}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </section>
          )}
        </>
      )}

      {canReadMenus ? (
        <OutletAuditFeed
          entries={auditEntries}
          subtitle="Published, draft, and sold-out changes for this outlet menu flow."
          title="Menu activity"
        />
      ) : null}
    </OutletPageLayout>
  );
}

function resolveDefaultVersionId(menu: StaffMenuDetail) {
  return (
    menu.versions.find((version) => version.status === 'DRAFT')?.id ??
    menu.versions.find((version) => version.status === 'PUBLISHED')?.id ??
    menu.versions[0]?.id ??
    ''
  );
}

function formatEnum(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatMoney(currency: string, cents: number) {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

function formatRealtimeStatus(status: RealtimeStatus) {
  switch (status) {
    case 'connected':
      return 'Loaded';
    case 'connecting':
      return 'Refreshing';
    case 'error':
      return 'Needs attention';
    default:
      return 'Idle';
  }
}

function parseCurrencyToCents(value: string): number | null {
  const normalized = value.replace(/\$/g, '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    return null;
  }
  return Math.round(Number(normalized) * 100);
}

function buildQuickDraftPayload(
  menuDetail: StaffMenuDetail,
  editableVersion: StaffMenuDetail['versions'][number],
  input: QuickAddItemInput,
): ReplaceMenuDraftInput {
  const draft = versionToQuickDraft(editableVersion);
  const categories = [...draft.categories];
  const newItem = createQuickDraftItem(input);

  if (input.quickCategoryMode === 'NEW') {
    categories.push({
      name: input.quickCategoryName,
      displayOrder: categories.length,
      active: true,
      items: [{ ...newItem, displayOrder: 0 }],
    });
  } else {
    const targetCategoryIndex = categories.findIndex(
      (category) => category.id === input.quickCategoryId,
    );
    if (targetCategoryIndex === -1) {
      throw new Error('The selected category is no longer available in this draft.');
    }
    const targetCategory = categories[targetCategoryIndex];
    categories[targetCategoryIndex] = {
      ...targetCategory,
      items: [
        ...targetCategory.items,
        { ...newItem, displayOrder: targetCategory.items.length },
      ],
    };
  }

  return {
    name: menuDetail.name,
    channel: menuDetail.channel,
    isDefault: menuDetail.isDefault,
    modifierGroups: draft.modifierGroups.map(stripModifierGroupIds),
    categories: categories.map(stripCategoryIds),
  };
}

function versionToQuickDraft(
  version: StaffMenuDetail['versions'][number],
): QuickDraftContent & {
  categories: QuickEditableCategory[];
} {
  return {
    modifierGroups: version.modifierGroups.map((group) => ({
      key: group.key,
      name: group.name,
      minSelect: group.minSelect,
      maxSelect: group.maxSelect,
      required: group.required,
      displayOrder: group.displayOrder,
      options: group.options.map((option) => ({
        name: option.name,
        priceDeltaCents: option.priceDeltaCents,
        displayOrder: option.displayOrder,
      })),
    })),
    categories: version.categories.map((category) => ({
      id: category.id,
      name: category.name,
      displayOrder: category.displayOrder,
      active: category.active,
      items: category.items.map((item) => ({
        sku: item.sku ?? undefined,
        name: item.name,
        description: item.description ?? undefined,
        basePriceCents: item.basePriceCents,
        taxable: item.taxable,
        serviceChargeable: item.serviceChargeable,
        preparationStationKey: item.preparationStationKey,
        active: item.active,
        soldOut: item.soldOut,
        displayOrder: item.displayOrder,
        variants: item.variants.map((variant) => ({
          name: variant.name,
          sku: variant.sku ?? undefined,
          priceDeltaCents: variant.priceDeltaCents,
          active: variant.active,
          displayOrder: variant.displayOrder,
        })),
        modifierGroupKeys: item.itemModifierGroups
          .sort((left, right) => left.displayOrder - right.displayOrder)
          .map(({ modifierGroup }) => modifierGroup.key),
      })),
    })),
  };
}

function createQuickDraftItem(input: QuickAddItemInput): QuickDraftItem {
  return {
    sku: input.quickItemSku || undefined,
    name: input.quickItemName,
    description: input.quickItemDescription || undefined,
    basePriceCents: input.quickItemPriceCents,
    taxable: input.quickItemTaxable,
    serviceChargeable: input.quickItemServiceChargeable,
    preparationStationKey: input.quickItemStation,
    active: input.quickItemActive,
    soldOut: false,
    displayOrder: 0,
    variants: [],
    modifierGroupKeys: [],
  };
}

function stripCategoryIds(
  category: QuickDraftCategory & { id?: string },
): ReplaceMenuDraftInput['categories'][number] {
  return {
    name: category.name,
    displayOrder: category.displayOrder,
    active: category.active,
    items: category.items.map(stripItemIds),
  };
}

function stripItemIds(item: QuickDraftItem): QuickDraftCategory['items'][number] {
  return {
    sku: item.sku,
    name: item.name,
    description: item.description,
    basePriceCents: item.basePriceCents,
    taxable: item.taxable,
    serviceChargeable: item.serviceChargeable,
    preparationStationKey: item.preparationStationKey,
    active: item.active,
    soldOut: item.soldOut,
    displayOrder: item.displayOrder,
    variants: (item.variants ?? []).map(stripVariantIds),
    modifierGroupKeys: item.modifierGroupKeys ?? [],
  };
}

function stripVariantIds(
  variant: QuickDraftVariant,
): NonNullable<QuickDraftCategory['items'][number]['variants']>[number] {
  return {
    name: variant.name,
    sku: variant.sku,
    priceDeltaCents: variant.priceDeltaCents,
    active: variant.active,
    displayOrder: variant.displayOrder,
  };
}

function stripModifierGroupIds(
  group: QuickDraftModifierGroup,
): NonNullable<ReplaceMenuDraftInput['modifierGroups']>[number] {
  return {
    key: group.key,
    name: group.name,
    minSelect: group.minSelect,
    maxSelect: group.maxSelect,
    required: group.required,
    displayOrder: group.displayOrder,
    options: group.options.map(stripModifierOptionIds),
  };
}

function stripModifierOptionIds(
  option: QuickDraftModifierOption,
): NonNullable<
  NonNullable<ReplaceMenuDraftInput['modifierGroups']>[number]['options']
>[number] {
  return {
    name: option.name,
    priceDeltaCents: option.priceDeltaCents,
    displayOrder: option.displayOrder,
  };
}
