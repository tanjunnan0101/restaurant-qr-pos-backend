'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import {
  cloneMenuDraft,
  getMenuDetail,
  getMenus,
  getOutletAuditLogs,
  publishMenu,
  setMenuItemSoldOut,
} from '@/lib/api';
import { OutletAuditFeed } from '@/components/outlet-audit-feed';
import { createOperationsSocket, outletOperationsEvents } from '@/lib/realtime';
import type {
  MenuListEntry,
  OutletAuditLogEntry,
  RealtimeStatus,
  StaffMenuDetail,
} from '@/lib/types';
import {
  OutletHeader,
  OutletPageLayout,
  useOutletContext,
} from './outlet-page-base';

type ItemVisibilityFilter = 'ALL' | 'AVAILABLE' | 'SOLD_OUT';

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
                  and adjust sold-out state at item level.
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
