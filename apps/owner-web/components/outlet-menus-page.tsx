'use client';

import { useEffect, useState } from 'react';
import {
  cloneMenuDraft,
  createMenuSetup,
  getMenuDetail,
  getMenus,
  publishMenu,
  replaceMenuDraft,
  setMenuItemSoldOut,
} from '@/lib/api';
import type {
  MenuChannel,
  MenuDetail,
  MenuListEntry,
  ReplaceMenuDraftInput,
  SetupMenuInput,
} from '@/lib/types';
import {
  OutletHeader,
  OutletPageLayout,
  useOutletContext,
} from './outlet-page-base';

const MENU_CHANNELS: MenuChannel[] = ['BOTH', 'QR', 'POS'];

export function OutletMenusPage() {
  const {
    outletId,
    session,
    loading,
    outlet,
    error: outletError,
    busy: outletBusy,
  } = useOutletContext();
  const [menus, setMenus] = useState<MenuListEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);
  const [publishBusyMenuId, setPublishBusyMenuId] = useState<string | null>(
    null,
  );
  const [detailBusyMenuId, setDetailBusyMenuId] = useState<string | null>(null);
  const [cloneBusyMenuId, setCloneBusyMenuId] = useState<string | null>(null);
  const [saveDraftBusyMenuId, setSaveDraftBusyMenuId] = useState<string | null>(
    null,
  );
  const [soldOutBusyItemId, setSoldOutBusyItemId] = useState<string | null>(
    null,
  );
  const [expandedMenuId, setExpandedMenuId] = useState<string | null>(null);
  const [menuDetails, setMenuDetails] = useState<Record<string, MenuDetail>>(
    {},
  );
  const [menuName, setMenuName] = useState('');
  const [menuSlug, setMenuSlug] = useState('');
  const [menuChannel, setMenuChannel] = useState<MenuChannel>('BOTH');
  const [isDefault, setIsDefault] = useState(true);
  const [publishImmediately, setPublishImmediately] = useState(true);
  const [menuLines, setMenuLines] = useState('');
  const [draftName, setDraftName] = useState<Record<string, string>>({});
  const [draftChannel, setDraftChannel] = useState<Record<string, MenuChannel>>(
    {},
  );
  const [draftIsDefault, setDraftIsDefault] = useState<Record<string, boolean>>(
    {},
  );
  const [draftLines, setDraftLines] = useState<Record<string, string>>({});
  const [soldOutReason, setSoldOutReason] = useState<Record<string, string>>(
    {},
  );

  async function refreshMenus(authToken: string) {
    const response = await getMenus(authToken, outletId);
    setMenus(response);
    setError(null);
    return response;
  }

  async function refreshMenuDetail(authToken: string, menuId: string) {
    const detail = await getMenuDetail(authToken, outletId, menuId);
    setMenuDetails((current) => ({ ...current, [menuId]: detail }));
    seedDraftEditor(detail);
    return detail;
  }

  function seedDraftEditor(detail: MenuDetail) {
    const editableVersion = getEditableVersion(detail);
    const content = versionToMenuLines(editableVersion);
    setDraftName((current) => ({ ...current, [detail.id]: detail.name }));
    setDraftChannel((current) => ({ ...current, [detail.id]: detail.channel }));
    setDraftIsDefault((current) => ({
      ...current,
      [detail.id]: detail.isDefault,
    }));
    setDraftLines((current) => ({ ...current, [detail.id]: content }));
  }

  useEffect(() => {
    if (!session?.accessToken) {
      return;
    }
    const authToken = session.accessToken;

    let cancelled = false;
    async function load() {
      setBusy(true);
      try {
        const response = await getMenus(authToken, outletId);
        if (!cancelled) {
          setMenus(response);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Failed to load menus.',
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
  }, [outletId, session]);

  useEffect(() => {
    if (!menuName.trim()) {
      return;
    }
    setMenuSlug((current) => {
      if (current.trim()) {
        return current;
      }
      return slugify(menuName);
    });
  }, [menuName]);

  async function handleSetupSubmit() {
    if (!session?.accessToken) {
      return;
    }

    const parsed = parseMenuLines(menuLines);
    if ('error' in parsed) {
      setActionError(parsed.error);
      setActionSuccess(null);
      return;
    }

    if (!menuName.trim()) {
      setActionError('Menu name is required.');
      setActionSuccess(null);
      return;
    }
    if (!menuSlug.trim()) {
      setActionError('Menu slug is required.');
      setActionSuccess(null);
      return;
    }

    const payload: SetupMenuInput = {
      name: menuName.trim(),
      slug: slugify(menuSlug),
      channel: menuChannel,
      isDefault,
      publish: publishImmediately,
      categories: parsed.categories,
      modifierGroups: [],
    };

    setSetupBusy(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await createMenuSetup(session.accessToken, outletId, payload);
      await refreshMenus(session.accessToken);
      setActionSuccess(
        publishImmediately
          ? `Created and published ${payload.name}.`
          : `Created ${payload.name} as a draft menu.`,
      );
      setMenuName('');
      setMenuSlug('');
      setMenuChannel('BOTH');
      setIsDefault(true);
      setPublishImmediately(true);
      setMenuLines('');
    } catch (submitError) {
      setActionError(
        submitError instanceof Error
          ? submitError.message
          : 'Failed to create the menu.',
      );
    } finally {
      setSetupBusy(false);
    }
  }

  async function handlePublish(menuId: string, menuNameValue: string) {
    if (!session?.accessToken) {
      return;
    }

    setPublishBusyMenuId(menuId);
    setActionError(null);
    setActionSuccess(null);
    try {
      await publishMenu(session.accessToken, outletId, menuId);
      await Promise.all([
        refreshMenus(session.accessToken),
        refreshMenuDetail(session.accessToken, menuId),
      ]);
      setActionSuccess(`Published the latest draft for ${menuNameValue}.`);
    } catch (submitError) {
      setActionError(
        submitError instanceof Error
          ? submitError.message
          : 'Failed to publish this menu.',
      );
    } finally {
      setPublishBusyMenuId(null);
    }
  }

  async function handleOpenMenu(menuId: string) {
    if (!session?.accessToken) {
      return;
    }

    const nextExpanded = expandedMenuId === menuId ? null : menuId;
    setExpandedMenuId(nextExpanded);
    if (!nextExpanded || menuDetails[menuId]) {
      return;
    }

    setDetailBusyMenuId(menuId);
    setActionError(null);
    try {
      await refreshMenuDetail(session.accessToken, menuId);
    } catch (loadError) {
      setActionError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load menu detail.',
      );
    } finally {
      setDetailBusyMenuId(null);
    }
  }

  async function handleCloneDraft(menuId: string, menuNameValue: string) {
    if (!session?.accessToken) {
      return;
    }

    setCloneBusyMenuId(menuId);
    setActionError(null);
    setActionSuccess(null);
    try {
      const detail = await cloneMenuDraft(
        session.accessToken,
        outletId,
        menuId,
      );
      setMenuDetails((current) => ({ ...current, [menuId]: detail }));
      seedDraftEditor(detail);
      await refreshMenus(session.accessToken);
      setActionSuccess(
        `Cloned the published menu into a new draft for ${menuNameValue}.`,
      );
      setExpandedMenuId(menuId);
    } catch (submitError) {
      setActionError(
        submitError instanceof Error
          ? submitError.message
          : 'Failed to clone a draft for this menu.',
      );
    } finally {
      setCloneBusyMenuId(null);
    }
  }

  async function handleSaveDraft(menuId: string, menuNameValue: string) {
    if (!session?.accessToken) {
      return;
    }

    const parsed = parseMenuLines(draftLines[menuId] ?? '');
    if ('error' in parsed) {
      setActionError(parsed.error);
      setActionSuccess(null);
      return;
    }

    const payload: ReplaceMenuDraftInput = {
      name: draftName[menuId]?.trim() || menuNameValue,
      channel: draftChannel[menuId] ?? 'BOTH',
      isDefault: draftIsDefault[menuId] ?? false,
      categories: parsed.categories,
      modifierGroups: [],
    };

    setSaveDraftBusyMenuId(menuId);
    setActionError(null);
    setActionSuccess(null);
    try {
      const detail = await replaceMenuDraft(
        session.accessToken,
        outletId,
        menuId,
        payload,
      );
      setMenuDetails((current) => ({ ...current, [menuId]: detail }));
      seedDraftEditor(detail);
      await refreshMenus(session.accessToken);
      setActionSuccess(`Saved the current draft for ${payload.name}.`);
    } catch (submitError) {
      setActionError(
        submitError instanceof Error
          ? submitError.message
          : 'Failed to save this draft.',
      );
    } finally {
      setSaveDraftBusyMenuId(null);
    }
  }

  async function handleToggleSoldOut(
    menuId: string,
    itemId: string,
    itemName: string,
    soldOut: boolean,
  ) {
    if (!session?.accessToken) {
      return;
    }

    const reason = soldOutReason[itemId]?.trim();
    if (!reason) {
      setActionError('A reason is required before changing sold-out status.');
      setActionSuccess(null);
      return;
    }

    setSoldOutBusyItemId(itemId);
    setActionError(null);
    setActionSuccess(null);
    try {
      await setMenuItemSoldOut(session.accessToken, outletId, itemId, {
        soldOut,
        reason,
      });
      await Promise.all([
        refreshMenus(session.accessToken),
        refreshMenuDetail(session.accessToken, menuId),
      ]);
      setSoldOutReason((current) => ({ ...current, [itemId]: '' }));
      setActionSuccess(
        soldOut
          ? `${itemName} is now marked sold out.`
          : `${itemName} is now available again.`,
      );
    } catch (submitError) {
      setActionError(
        submitError instanceof Error
          ? submitError.message
          : 'Failed to change sold-out status.',
      );
    } finally {
      setSoldOutBusyItemId(null);
    }
  }

  return (
    <OutletPageLayout
      title="Menu workspace"
      subtitle="Create first menus quickly, then clone drafts, replace draft content, publish updates, and manage sold-out items."
    >
      {outlet && <OutletHeader outlet={outlet} />}

      <section className="section-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Menu setup</p>
            <h2 className="serif">Create a menu in one pass</h2>
            <p>
              This onboarding flow is optimized for getting a usable menu live
              quickly. Add category headers and item lines, then publish
              immediately or save as a draft.
            </p>
          </div>
        </div>

        <div className="detail-grid">
          <div className="field">
            <label htmlFor="menu-name">Menu name</label>
            <input
              id="menu-name"
              onChange={(event) => setMenuName(event.target.value)}
              placeholder="All-day menu"
              value={menuName}
            />
          </div>
          <div className="field">
            <label htmlFor="menu-slug">Menu slug</label>
            <input
              id="menu-slug"
              onChange={(event) => setMenuSlug(slugify(event.target.value))}
              placeholder="all-day-menu"
              value={menuSlug}
            />
          </div>
          <div className="field">
            <label htmlFor="menu-channel">Channel</label>
            <select
              id="menu-channel"
              onChange={(event) =>
                setMenuChannel(event.target.value as MenuChannel)
              }
              value={menuChannel}
            >
              {MENU_CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {channel}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="menu-lines">Categories and items</label>
          <textarea
            id="menu-lines"
            onChange={(event) => setMenuLines(event.target.value)}
            placeholder={
              '# Signatures\nSignature Noodles | 6.50 | Best seller noodle bowl | SIG-NOODLES\nLaksa | 7.20 | Spicy coconut laksa\n\n# Drinks\nIced Lemon Tea | 2.50 | Fresh brewed | DRINK-LEMON'
            }
            rows={12}
            value={menuLines}
          />
          <span className="helper-text">
            Use `# Category name` to start a category. Then add item lines as
            `name | price | description | sku`. Only name and price are
            required. Price is entered in dollars and cents.
          </span>
        </div>

        <label className="checkbox-row">
          <input
            checked={isDefault}
            onChange={(event) => setIsDefault(event.target.checked)}
            type="checkbox"
          />
          <span>Make this the default menu for the outlet.</span>
        </label>

        <label className="checkbox-row">
          <input
            checked={publishImmediately}
            onChange={(event) => setPublishImmediately(event.target.checked)}
            type="checkbox"
          />
          <span>Publish immediately after creation.</span>
        </label>

        <div className="action-row">
          <button
            className="primary-button"
            disabled={setupBusy}
            onClick={() => void handleSetupSubmit()}
            type="button"
          >
            {setupBusy ? 'Saving menu...' : 'Create menu'}
          </button>
        </div>

        {actionError && <div className="alert error">{actionError}</div>}
        {actionSuccess && <div className="alert success">{actionSuccess}</div>}
      </section>

      <section className="section-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Menus</p>
            <h2 className="serif">Current outlet menus</h2>
          </div>
        </div>

        {loading || outletBusy || busy ? (
          <p>Loading menus...</p>
        ) : outletError || error ? (
          <div className="alert error">{outletError ?? error}</div>
        ) : menus.length === 0 ? (
          <div className="empty-state">
            <strong>No menus yet.</strong>
            <p>
              Use the setup form above to create the first QR or POS menu for
              this outlet.
            </p>
          </div>
        ) : (
          <div className="list-block">
            {menus.map((menu) => {
              const hasDraft = menu.versions.some(
                (version) => version.status === 'DRAFT',
              );
              const latestPublished = menu.versions.find(
                (version) => version.status === 'PUBLISHED',
              );
              const detail = menuDetails[menu.id];
              const editableVersion = detail
                ? getEditableVersion(detail)
                : null;
              const draftVersion = detail
                ? detail.versions.find((version) => version.status === 'DRAFT')
                : null;
              const isExpanded = expandedMenuId === menu.id;

              return (
                <article className="list-item" key={menu.id}>
                  <div className="section-header">
                    <div>
                      <h3>{menu.name}</h3>
                      <p>
                        {menu.slug} • {menu.channel}
                      </p>
                    </div>
                    <div className="badge-row">
                      {menu.isDefault && (
                        <span className="badge success">Default</span>
                      )}
                      <span className="badge">{menu.status}</span>
                      {hasDraft && (
                        <span className="badge warn">Draft ready</span>
                      )}
                    </div>
                  </div>

                  <div className="detail-grid">
                    <article className="info-card">
                      <span className="metric-label">Versions</span>
                      <span className="metric-value">
                        {menu.versions.length}
                      </span>
                      <p className="metric-note">
                        Latest published{' '}
                        {latestPublished
                          ? `v${latestPublished.versionNumber}`
                          : 'none'}
                      </p>
                    </article>
                    {menu.versions.map((version) => (
                      <article className="info-card" key={version.id}>
                        <span className="metric-label">
                          Version {version.versionNumber}
                        </span>
                        <span className="metric-value">{version.status}</span>
                        <p className="metric-note">
                          Published {version.publishedAt ?? 'not yet'}
                        </p>
                      </article>
                    ))}
                  </div>

                  <div className="action-row">
                    <button
                      className="secondary-button"
                      disabled={detailBusyMenuId === menu.id}
                      onClick={() => void handleOpenMenu(menu.id)}
                      type="button"
                    >
                      {detailBusyMenuId === menu.id
                        ? 'Loading detail...'
                        : isExpanded
                          ? 'Close advanced controls'
                          : 'Open advanced controls'}
                    </button>

                    {!hasDraft && (
                      <button
                        className="secondary-button"
                        disabled={cloneBusyMenuId === menu.id}
                        onClick={() =>
                          void handleCloneDraft(menu.id, menu.name)
                        }
                        type="button"
                      >
                        {cloneBusyMenuId === menu.id
                          ? 'Cloning draft...'
                          : 'Clone published to draft'}
                      </button>
                    )}

                    {hasDraft && (
                      <button
                        className="secondary-button"
                        disabled={publishBusyMenuId === menu.id}
                        onClick={() => void handlePublish(menu.id, menu.name)}
                        type="button"
                      >
                        {publishBusyMenuId === menu.id
                          ? 'Publishing...'
                          : 'Publish draft'}
                      </button>
                    )}
                  </div>

                  {isExpanded && detail && (
                    <div className="control-panel">
                      <div className="section-header">
                        <div>
                          <p className="eyebrow">Advanced controls</p>
                          <h4>Maintain draft content and item availability</h4>
                        </div>
                      </div>

                      <div className="detail-grid">
                        <div className="field">
                          <label htmlFor={`draft-name-${menu.id}`}>
                            Menu name
                          </label>
                          <input
                            id={`draft-name-${menu.id}`}
                            onChange={(event) =>
                              setDraftName((current) => ({
                                ...current,
                                [menu.id]: event.target.value,
                              }))
                            }
                            value={draftName[menu.id] ?? detail.name}
                          />
                        </div>
                        <div className="field">
                          <label htmlFor={`draft-channel-${menu.id}`}>
                            Channel
                          </label>
                          <select
                            id={`draft-channel-${menu.id}`}
                            onChange={(event) =>
                              setDraftChannel((current) => ({
                                ...current,
                                [menu.id]: event.target.value as MenuChannel,
                              }))
                            }
                            value={draftChannel[menu.id] ?? detail.channel}
                          >
                            {MENU_CHANNELS.map((channel) => (
                              <option key={channel} value={channel}>
                                {channel}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <label className="checkbox-row">
                        <input
                          checked={draftIsDefault[menu.id] ?? detail.isDefault}
                          onChange={(event) =>
                            setDraftIsDefault((current) => ({
                              ...current,
                              [menu.id]: event.target.checked,
                            }))
                          }
                          type="checkbox"
                        />
                        <span>Keep this menu as the outlet default.</span>
                      </label>

                      <div className="field">
                        <label htmlFor={`draft-lines-${menu.id}`}>
                          Draft editor
                        </label>
                        <textarea
                          id={`draft-lines-${menu.id}`}
                          onChange={(event) =>
                            setDraftLines((current) => ({
                              ...current,
                              [menu.id]: event.target.value,
                            }))
                          }
                          rows={12}
                          value={draftLines[menu.id] ?? ''}
                        />
                        <span className="helper-text">
                          This editor uses the same simple format as initial
                          menu setup. Save replaces the current draft version
                          content.
                        </span>
                      </div>

                      <div className="action-row">
                        <button
                          className="primary-button"
                          disabled={
                            !draftVersion || saveDraftBusyMenuId === menu.id
                          }
                          onClick={() =>
                            void handleSaveDraft(menu.id, menu.name)
                          }
                          type="button"
                        >
                          {saveDraftBusyMenuId === menu.id
                            ? 'Saving draft...'
                            : 'Save draft content'}
                        </button>
                      </div>

                      {editableVersion && (
                        <div className="list-block">
                          <article className="info-card">
                            <span className="metric-label">
                              Editing version
                            </span>
                            <span className="metric-value">
                              v{editableVersion.versionNumber}
                            </span>
                            <p className="metric-note">
                              Status {editableVersion.status} • Published{' '}
                              {editableVersion.publishedAt ?? 'not yet'}
                            </p>
                          </article>

                          {editableVersion.categories.map((category) => (
                            <article className="list-item" key={category.id}>
                              <div className="section-header">
                                <div>
                                  <h4>{category.name}</h4>
                                  <p>{category.items.length} items</p>
                                </div>
                              </div>
                              <div className="list-block">
                                {category.items.map((item) => {
                                  const reason = soldOutReason[item.id] ?? '';
                                  return (
                                    <article
                                      className="info-card"
                                      key={item.id}
                                    >
                                      <div className="section-header">
                                        <div>
                                          <span className="metric-label">
                                            {item.sku ?? 'No SKU'}
                                          </span>
                                          <span className="metric-value scope-card-value">
                                            {item.name}
                                          </span>
                                        </div>
                                        <div className="badge-row">
                                          <span
                                            className={
                                              item.soldOut
                                                ? 'badge danger'
                                                : 'badge success'
                                            }
                                          >
                                            {item.soldOut
                                              ? 'Sold out'
                                              : 'Available'}
                                          </span>
                                        </div>
                                      </div>
                                      <p className="metric-note">
                                        {formatPrice(item.basePriceCents)}
                                        {item.description
                                          ? ` • ${item.description}`
                                          : ''}
                                      </p>
                                      <div className="field">
                                        <label
                                          htmlFor={`soldout-reason-${item.id}`}
                                        >
                                          Reason for status change
                                        </label>
                                        <textarea
                                          id={`soldout-reason-${item.id}`}
                                          onChange={(event) =>
                                            setSoldOutReason((current) => ({
                                              ...current,
                                              [item.id]: event.target.value,
                                            }))
                                          }
                                          placeholder={
                                            item.soldOut
                                              ? 'Explain why this item is available again.'
                                              : 'Explain why this item is sold out.'
                                          }
                                          rows={2}
                                          value={reason}
                                        />
                                      </div>
                                      <div className="action-row">
                                        <button
                                          className="secondary-button"
                                          disabled={
                                            soldOutBusyItemId === item.id ||
                                            !reason.trim()
                                          }
                                          onClick={() =>
                                            void handleToggleSoldOut(
                                              menu.id,
                                              item.id,
                                              item.name,
                                              !item.soldOut,
                                            )
                                          }
                                          type="button"
                                        >
                                          {soldOutBusyItemId === item.id
                                            ? 'Saving...'
                                            : item.soldOut
                                              ? 'Mark available'
                                              : 'Mark sold out'}
                                        </button>
                                      </div>
                                    </article>
                                  );
                                })}
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </OutletPageLayout>
  );
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseMenuLines(
  input: string,
): { categories: SetupMenuInput['categories'] } | { error: string } {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { error: 'Add at least one category and one item line.' };
  }

  const categories: SetupMenuInput['categories'] = [];
  let currentCategory: SetupMenuInput['categories'][number] | null = null;
  let itemDisplayOrder = 0;

  for (const line of lines) {
    if (line.startsWith('#')) {
      const categoryName = line.replace(/^#+/, '').trim();
      if (!categoryName) {
        return { error: 'Category headers must include a category name.' };
      }
      currentCategory = {
        name: categoryName,
        displayOrder: categories.length,
        active: true,
        items: [],
      };
      categories.push(currentCategory);
      itemDisplayOrder = 0;
      continue;
    }

    if (!currentCategory) {
      return {
        error:
          'Start each group of items with a category header like `# Signatures`.',
      };
    }

    const parts = line.split('|').map((part) => part.trim());
    if (parts.length < 2) {
      return {
        error:
          'Each item line needs at least `name | price`. Description and SKU are optional.',
      };
    }

    const [name, priceText, description, sku] = parts;
    if (!name || !priceText) {
      return {
        error: 'Each item line must include both a name and a price.',
      };
    }

    const basePriceCents = parsePriceToCents(priceText);
    if (basePriceCents === null) {
      return {
        error: `Price must be a valid number like 6.50 for item ${name}.`,
      };
    }

    currentCategory.items.push({
      name,
      basePriceCents,
      description: description || undefined,
      sku: sku || undefined,
      taxable: true,
      serviceChargeable: true,
      preparationStationKey: 'main-kitchen',
      active: true,
      soldOut: false,
      displayOrder: itemDisplayOrder,
      modifierGroupKeys: [],
    });
    itemDisplayOrder += 1;
  }

  if (categories.length === 0) {
    return { error: 'Add at least one category header.' };
  }

  if (categories.some((category) => category.items.length === 0)) {
    return {
      error: 'Every category must contain at least one item line.',
    };
  }

  return { categories };
}

function parsePriceToCents(value: string): number | null {
  const normalized = value.replace(/\$/g, '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    return null;
  }
  return Math.round(Number(normalized) * 100);
}

function getEditableVersion(detail: MenuDetail) {
  return (
    detail.versions.find((version) => version.status === 'DRAFT') ??
    detail.versions.find((version) => version.status === 'PUBLISHED') ??
    detail.versions[0]
  );
}

function versionToMenuLines(
  version: MenuDetail['versions'][number] | undefined,
) {
  if (!version) {
    return '';
  }

  return version.categories
    .map((category) => {
      const itemLines = category.items.map((item) => {
        const parts = [
          item.name,
          formatPrice(item.basePriceCents, false),
          item.description ?? '',
          item.sku ?? '',
        ];
        while (parts.length > 2 && parts[parts.length - 1] === '') {
          parts.pop();
        }
        return parts.join(' | ');
      });
      return [`# ${category.name}`, ...itemLines].join('\n');
    })
    .join('\n\n');
}

function formatPrice(cents: number, withCurrency = true) {
  const amount = (cents / 100).toFixed(2);
  return withCurrency ? `$${amount}` : amount;
}
