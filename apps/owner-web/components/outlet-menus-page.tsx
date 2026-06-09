'use client';

import { useEffect, useMemo, useState } from 'react';
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
const DEFAULT_PREPARATION_STATION = 'main-kitchen';

type DraftMenuContent = {
  modifierGroups: NonNullable<ReplaceMenuDraftInput['modifierGroups']>;
  categories: ReplaceMenuDraftInput['categories'];
};

type DraftMenuCategory = DraftMenuContent['categories'][number];
type DraftMenuItem = DraftMenuCategory['items'][number];
type DraftModifierGroup = DraftMenuContent['modifierGroups'][number];
type DraftModifierOption = DraftModifierGroup['options'][number];
type DraftVariant = NonNullable<DraftMenuItem['variants']>[number];

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
  const [draftContent, setDraftContent] = useState<
    Record<string, DraftMenuContent>
  >({});
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
    setDraftName((current) => ({ ...current, [detail.id]: detail.name }));
    setDraftChannel((current) => ({ ...current, [detail.id]: detail.channel }));
    setDraftIsDefault((current) => ({
      ...current,
      [detail.id]: detail.isDefault,
    }));
    setDraftContent((current) => ({
      ...current,
      [detail.id]: versionToDraftContent(editableVersion),
    }));
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

  function updateDraftContentState(
    menuId: string,
    updater: (content: DraftMenuContent) => DraftMenuContent,
  ) {
    setDraftContent((current) => {
      const existing = current[menuId] ?? createEmptyDraftContent();
      return {
        ...current,
        [menuId]: updater(existing),
      };
    });
  }

  function addModifierGroup(menuId: string) {
    updateDraftContentState(menuId, (content) => ({
      ...content,
      modifierGroups: [
        ...content.modifierGroups,
        createEmptyModifierGroup(content.modifierGroups.length),
      ],
    }));
  }

  function updateModifierGroupField(
    menuId: string,
    groupIndex: number,
    field: keyof Omit<DraftModifierGroup, 'options'>,
    value: string | number | boolean,
  ) {
    updateDraftContentState(menuId, (content) => {
      const groups = content.modifierGroups.map((group, index) =>
        index === groupIndex ? { ...group } : group,
      );
      const targetGroup = groups[groupIndex];
      if (!targetGroup) {
        return content;
      }

      if (field === 'key') {
        const previousKey = targetGroup.key;
        const nextKey = slugify(String(value));
        targetGroup.key = nextKey;
        return {
          ...content,
          modifierGroups: groups,
          categories: content.categories.map((category) => ({
            ...category,
            items: category.items.map((item) => ({
              ...item,
              modifierGroupKeys: (item.modifierGroupKeys ?? []).map((key) =>
                key === previousKey ? nextKey : key,
              ),
            })),
          })),
        };
      }

      Object.assign(targetGroup, { [field]: value });
      return {
        ...content,
        modifierGroups: groups,
      };
    });
  }

  function removeModifierGroup(menuId: string, groupIndex: number) {
    updateDraftContentState(menuId, (content) => {
      const removedKey = content.modifierGroups[groupIndex]?.key;
      return {
        ...content,
        modifierGroups: content.modifierGroups.filter(
          (_, index) => index !== groupIndex,
        ),
        categories: content.categories.map((category) => ({
          ...category,
          items: category.items.map((item) => ({
            ...item,
            modifierGroupKeys: (item.modifierGroupKeys ?? []).filter(
              (key) => key !== removedKey,
            ),
          })),
        })),
      };
    });
  }

  function addModifierOption(menuId: string, groupIndex: number) {
    updateDraftContentState(menuId, (content) => ({
      ...content,
      modifierGroups: content.modifierGroups.map((group, index) =>
        index === groupIndex
          ? {
              ...group,
              options: [...group.options, createEmptyModifierOption(group.options.length)],
            }
          : group,
      ),
    }));
  }

  function updateModifierOptionField(
    menuId: string,
    groupIndex: number,
    optionIndex: number,
    field: keyof DraftModifierOption,
    value: string | number,
  ) {
    updateDraftContentState(menuId, (content) => ({
      ...content,
      modifierGroups: content.modifierGroups.map((group, index) =>
        index === groupIndex
          ? {
              ...group,
              options: group.options.map((option, currentIndex) =>
                currentIndex === optionIndex
                  ? { ...option, [field]: value }
                  : option,
              ),
            }
          : group,
      ),
    }));
  }

  function removeModifierOption(
    menuId: string,
    groupIndex: number,
    optionIndex: number,
  ) {
    updateDraftContentState(menuId, (content) => ({
      ...content,
      modifierGroups: content.modifierGroups.map((group, index) =>
        index === groupIndex
          ? {
              ...group,
              options:
                group.options.length > 1
                  ? group.options.filter(
                      (_, currentIndex) => currentIndex !== optionIndex,
                    )
                  : group.options,
            }
          : group,
      ),
    }));
  }

  function addCategory(menuId: string) {
    updateDraftContentState(menuId, (content) => ({
      ...content,
      categories: [...content.categories, createEmptyCategory(content.categories.length)],
    }));
  }

  function updateCategoryField(
    menuId: string,
    categoryIndex: number,
    field: keyof Omit<DraftMenuCategory, 'items'>,
    value: string | number | boolean,
  ) {
    updateDraftContentState(menuId, (content) => ({
      ...content,
      categories: content.categories.map((category, index) =>
        index === categoryIndex ? { ...category, [field]: value } : category,
      ),
    }));
  }

  function removeCategory(menuId: string, categoryIndex: number) {
    updateDraftContentState(menuId, (content) => ({
      ...content,
      categories: content.categories.filter((_, index) => index !== categoryIndex),
    }));
  }

  function addItem(menuId: string, categoryIndex: number) {
    updateDraftContentState(menuId, (content) => ({
      ...content,
      categories: content.categories.map((category, index) =>
        index === categoryIndex
          ? {
              ...category,
              items: [...category.items, createEmptyItem(category.items.length)],
            }
          : category,
      ),
    }));
  }

  function updateItemField(
    menuId: string,
    categoryIndex: number,
    itemIndex: number,
    field: keyof DraftMenuItem,
    value: string | number | boolean | string[],
  ) {
    updateDraftContentState(menuId, (content) => ({
      ...content,
      categories: content.categories.map((category, currentCategoryIndex) =>
        currentCategoryIndex === categoryIndex
          ? {
              ...category,
              items: category.items.map((item, currentItemIndex) =>
                currentItemIndex === itemIndex
                  ? { ...item, [field]: value }
                  : item,
              ),
            }
          : category,
      ),
    }));
  }

  function removeItem(menuId: string, categoryIndex: number, itemIndex: number) {
    updateDraftContentState(menuId, (content) => ({
      ...content,
      categories: content.categories.map((category, index) =>
        index === categoryIndex
          ? {
              ...category,
              items: category.items.filter(
                (_, currentItemIndex) => currentItemIndex !== itemIndex,
              ),
            }
          : category,
      ),
    }));
  }

  function toggleItemModifierGroup(
    menuId: string,
    categoryIndex: number,
    itemIndex: number,
    groupKey: string,
  ) {
    updateDraftContentState(menuId, (content) => ({
      ...content,
      categories: content.categories.map((category, currentCategoryIndex) =>
        currentCategoryIndex === categoryIndex
          ? {
              ...category,
              items: category.items.map((item, currentItemIndex) => {
                if (currentItemIndex !== itemIndex) {
                  return item;
                }
                const keys = item.modifierGroupKeys ?? [];
                const nextKeys = keys.includes(groupKey)
                  ? keys.filter((key) => key !== groupKey)
                  : [...keys, groupKey];
                return { ...item, modifierGroupKeys: nextKeys };
              }),
            }
          : category,
      ),
    }));
  }

  function addVariant(menuId: string, categoryIndex: number, itemIndex: number) {
    updateDraftContentState(menuId, (content) => ({
      ...content,
      categories: content.categories.map((category, currentCategoryIndex) =>
        currentCategoryIndex === categoryIndex
          ? {
              ...category,
              items: category.items.map((item, currentItemIndex) =>
                currentItemIndex === itemIndex
                  ? {
                      ...item,
                      variants: [
                        ...(item.variants ?? []),
                        createEmptyVariant((item.variants ?? []).length),
                      ],
                    }
                  : item,
              ),
            }
          : category,
      ),
    }));
  }

  function updateVariantField(
    menuId: string,
    categoryIndex: number,
    itemIndex: number,
    variantIndex: number,
    field: keyof DraftVariant,
    value: string | number,
  ) {
    updateDraftContentState(menuId, (content) => ({
      ...content,
      categories: content.categories.map((category, currentCategoryIndex) =>
        currentCategoryIndex === categoryIndex
          ? {
              ...category,
              items: category.items.map((item, currentItemIndex) =>
                currentItemIndex === itemIndex
                  ? {
                      ...item,
                      variants: (item.variants ?? []).map((variant, currentVariantIndex) =>
                        currentVariantIndex === variantIndex
                          ? { ...variant, [field]: value }
                          : variant,
                      ),
                    }
                  : item,
              ),
            }
          : category,
      ),
    }));
  }

  function removeVariant(
    menuId: string,
    categoryIndex: number,
    itemIndex: number,
    variantIndex: number,
  ) {
    updateDraftContentState(menuId, (content) => ({
      ...content,
      categories: content.categories.map((category, currentCategoryIndex) =>
        currentCategoryIndex === categoryIndex
          ? {
              ...category,
              items: category.items.map((item, currentItemIndex) =>
                currentItemIndex === itemIndex
                  ? {
                      ...item,
                      variants: (item.variants ?? []).filter(
                        (_, currentVariantIndex) => currentVariantIndex !== variantIndex,
                      ),
                    }
                  : item,
              ),
            }
          : category,
      ),
    }));
  }

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

    const content = draftContent[menuId];
    if (!content || content.categories.length === 0) {
      setActionError('Add at least one category before saving this draft.');
      setActionSuccess(null);
      return;
    }
    if (content.categories.some((category) => category.items.length === 0)) {
      setActionError('Every category must contain at least one item.');
      setActionSuccess(null);
      return;
    }

    const payload: ReplaceMenuDraftInput = {
      name: draftName[menuId]?.trim() || menuNameValue,
      channel: draftChannel[menuId] ?? 'BOTH',
      isDefault: draftIsDefault[menuId] ?? false,
      categories: content.categories,
      modifierGroups: content.modifierGroups,
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

  const menuWorkspaceSummary = useMemo(() => {
    const totalMenus = menus.length;
    const draftMenus = menus.filter((menu) =>
      menu.versions.some((version) => version.status === 'DRAFT'),
    ).length;
    const publishedMenus = menus.filter((menu) =>
      menu.versions.some((version) => version.status === 'PUBLISHED'),
    ).length;
    const totalVersions = menus.reduce(
      (sum, menu) => sum + menu.versions.length,
      0,
    );
    const defaultMenu = menus.find((menu) => menu.isDefault) ?? null;

    let nextActionTitle = 'Create the first live menu';
    let nextActionBody =
      'Use the quick launch form to publish one guest-ready menu for QR, POS, or both.';

    if (totalMenus > 0 && draftMenus === 0) {
      nextActionTitle = 'Clone a published menu into draft';
      nextActionBody =
        'Use draft mode for pricing, category, and item changes before touching the live guest menu.';
    }

    if (draftMenus > 0) {
      nextActionTitle = 'Review and publish the active draft';
      nextActionBody =
        'Open advanced controls, clear readiness issues, and push the draft live when service is ready.';
    }

    return {
      totalMenus,
      draftMenus,
      publishedMenus,
      totalVersions,
      defaultMenu,
      nextActionTitle,
      nextActionBody,
    };
  }, [menus]);

  return (
    <OutletPageLayout
      title="Menu workspace"
      subtitle="Create first menus quickly, then clone drafts, replace draft content, publish updates, and manage sold-out items."
    >
      {outlet && <OutletHeader outlet={outlet} />}

      <section className="section-panel workspace-hero">
        <div className="workspace-hero__header">
          <div className="workspace-hero__copy">
            <p className="eyebrow">Owner menu control</p>
            <h2 className="serif hero-panel__title">
              Build, stage, and ship menu changes without losing service flow.
            </h2>
            <p className="hero-panel__lede">
              The strongest restaurant systems separate quick launch, draft
              iteration, and live service controls. This workspace now follows
              that same rhythm so owners can set menus up fast and still manage
              change safely.
            </p>
          </div>
          <div className="workspace-pill-grid">
            <div className="workspace-pill current">
              <span>
                {menuWorkspaceSummary.defaultMenu
                  ? `Default: ${menuWorkspaceSummary.defaultMenu.name}`
                  : 'Default menu not set'}
              </span>
            </div>
            <div className="workspace-pill">
              <span>{menuWorkspaceSummary.totalVersions} total versions</span>
            </div>
            <div className="workspace-pill">
              <span>{menuWorkspaceSummary.publishedMenus} published menus</span>
            </div>
          </div>
        </div>

        <div className="operations-summary-grid">
          <article className="operations-summary-card">
            <span className="metric-label">Menus configured</span>
            <strong>{menuWorkspaceSummary.totalMenus}</strong>
            <p>All outlet menus currently available across QR, POS, or both.</p>
          </article>
          <article className="operations-summary-card">
            <span className="metric-label">Drafts in flight</span>
            <strong>{menuWorkspaceSummary.draftMenus}</strong>
            <p>Menu revisions waiting for review, save, or publish.</p>
          </article>
          <article className="operations-summary-card">
            <span className="metric-label">Published</span>
            <strong>{menuWorkspaceSummary.publishedMenus}</strong>
            <p>Live menus that can currently serve guests or staff orders.</p>
          </article>
          <article className="operations-summary-card">
            <span className="metric-label">Best next step</span>
            <strong>{menuWorkspaceSummary.nextActionTitle}</strong>
            <p>{menuWorkspaceSummary.nextActionBody}</p>
          </article>
        </div>
      </section>

      <section className="section-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Workflow lanes</p>
            <h2 className="serif">Three menu jobs, one cleaner owner flow</h2>
            <p>
              Launch a menu quickly, iterate safely in draft, and keep live
              service accurate with sold-out controls and publish checkpoints.
            </p>
          </div>
        </div>

        <div className="outlet-grid">
          <article className="info-card info-card--compact">
            <span className="metric-label">1. Quick launch</span>
            <span className="metric-value">Type and go live</span>
            <p className="metric-note">
              Use the guided setup form below to create a first usable menu from
              categories and items in one pass.
            </p>
          </article>
          <article className="info-card info-card--compact">
            <span className="metric-label">2. Draft lab</span>
            <span className="metric-value">Edit before impact</span>
            <p className="metric-note">
              Clone a published menu into draft, adjust items, modifiers, and
              categories, then compare readiness before publishing.
            </p>
          </article>
          <article className="info-card info-card--compact">
            <span className="metric-label">3. Live service control</span>
            <span className="metric-value">Protect the floor</span>
            <p className="metric-note">
              Mark items sold out, keep the default menu clear, and avoid
              pushing half-finished changes during service hours.
            </p>
          </article>
        </div>
      </section>

      <section className="section-panel list-item--elevated">
        <div className="section-header">
          <div>
            <p className="eyebrow">Menu setup</p>
            <h2 className="serif">Create a menu in one pass</h2>
            <p>
              Start with the fastest setup path: define categories, add item
              lines, choose the sales channel, then either publish immediately
              or hold the result as a draft.
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
            <p>
              Open any menu to inspect versions, compare draft against
              published, and manage sold-out visibility from the same surface.
            </p>
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
              const publishedVersion = detail
                ? detail.versions.find((version) => version.status === 'PUBLISHED')
                : undefined;
              const editableVersion = detail
                ? getEditableVersion(detail)
                : null;
              const draftVersion = detail
                ? detail.versions.find((version) => version.status === 'DRAFT')
                : null;
              const currentDraftContent =
                draftContent[menu.id] ??
                versionToDraftContent(editableVersion ?? undefined);
              const readinessIssues = getDraftReadinessIssues(currentDraftContent);
              const draftSummary = summarizeDraftContent(currentDraftContent);
              const publishedSummary = summarizeMenuVersion(publishedVersion);
              const draftDiff = buildDraftDiff(
                currentDraftContent,
                publishedVersion,
              );
              const isExpanded = expandedMenuId === menu.id;

              return (
                <article className="list-item list-item--elevated" key={menu.id}>
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

                      <div className="outlet-grid">
                        <article className="info-card">
                          <span className="metric-label">Publish readiness</span>
                          <span className="metric-value">
                            {readinessIssues.length === 0 ? 'Ready' : 'Review'}
                          </span>
                          <p className="metric-note">
                            {readinessIssues.length === 0
                              ? 'This draft passes the owner-side checks and looks ready to publish.'
                              : `${readinessIssues.length} issue${readinessIssues.length === 1 ? '' : 's'} should be reviewed before publishing.`}
                          </p>
                          <div className="badge-row">
                            <span
                              className={
                                readinessIssues.length === 0
                                  ? 'badge success'
                                  : 'badge warn'
                              }
                            >
                              {readinessIssues.length === 0
                                ? 'Draft ready'
                                : 'Needs attention'}
                            </span>
                            {draftVersion ? (
                              <span className="badge">Draft in progress</span>
                            ) : (
                              <span className="badge">Published source view</span>
                            )}
                          </div>
                        </article>

                        <article className="info-card">
                          <span className="metric-label">Draft vs published</span>
                          <span className="metric-value">
                            {publishedVersion ? 'Compared' : 'First publish'}
                          </span>
                          <p className="metric-note">
                            {publishedVersion
                              ? `Categories ${formatSignedDiff(draftDiff.categories)} • Items ${formatSignedDiff(draftDiff.items)} • Variants ${formatSignedDiff(draftDiff.variants)}`
                              : 'There is no published version yet. Publishing this draft will create the first live menu.'}
                          </p>
                          <div className="badge-row">
                            <span className="badge">
                              Modifier groups {formatSignedDiff(draftDiff.modifierGroups)}
                            </span>
                            <span className="badge">
                              Sold out {formatSignedDiff(draftDiff.soldOutItems)}
                            </span>
                          </div>
                        </article>
                      </div>

                      {readinessIssues.length > 0 ? (
                        <div className="alert warn">
                          <strong>Review before publishing:</strong>
                          <ul className="sub-list">
                            {readinessIssues.map((issue) => (
                              <li key={issue}>{issue}</li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <div className="alert success">
                          Owner-side checks look good. You can save this draft
                          and publish when ready.
                        </div>
                      )}

                      <div className="outlet-grid">
                        <article className="info-card">
                          <span className="metric-label">Draft summary</span>
                          <span className="metric-value">
                            {draftSummary.items} items
                          </span>
                          <p className="metric-note">
                            {draftSummary.categories} categories •{' '}
                            {draftSummary.modifierGroups} modifier groups •{' '}
                            {draftSummary.variants} variants
                          </p>
                        </article>
                        <article className="info-card">
                          <span className="metric-label">Published summary</span>
                          <span className="metric-value">
                            {publishedSummary.items} items
                          </span>
                          <p className="metric-note">
                            {publishedSummary.categories} categories •{' '}
                            {publishedSummary.modifierGroups} modifier groups •{' '}
                            {publishedSummary.variants} variants
                          </p>
                        </article>
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

                      <div className="structured-editor">
                        <div className="section-header">
                          <div>
                            <label>Modifier groups</label>
                            <p className="helper-text">
                              Build reusable choice groups, then assign them to
                              items below.
                            </p>
                          </div>
                          <button
                            className="secondary-button"
                            onClick={() => addModifierGroup(menu.id)}
                            type="button"
                          >
                            Add modifier group
                          </button>
                        </div>

                        {(draftContent[menu.id]?.modifierGroups ?? []).length ===
                        0 ? (
                          <div className="empty-state">
                            <strong>No modifier groups yet.</strong>
                            <p>
                              Add one when an item needs choices like spice
                              level, toppings, or drink size.
                            </p>
                          </div>
                        ) : (
                          <div className="editor-stack">
                            {(draftContent[menu.id]?.modifierGroups ?? []).map(
                              (group, groupIndex) => (
                                <article className="editor-card" key={`${menu.id}-group-${groupIndex}`}>
                                  <div className="section-header">
                                    <div>
                                      <h4>{group.name || `Modifier group ${groupIndex + 1}`}</h4>
                                      <p className="helper-text">
                                        Key `{group.key || 'set-a-key'}` powers
                                        item assignments.
                                      </p>
                                    </div>
                                    <button
                                      className="ghost-button"
                                      onClick={() =>
                                        removeModifierGroup(menu.id, groupIndex)
                                      }
                                      type="button"
                                    >
                                      Remove group
                                    </button>
                                  </div>

                                  <div className="detail-grid">
                                    <div className="field">
                                      <label>Key</label>
                                      <input
                                        onChange={(event) =>
                                          updateModifierGroupField(
                                            menu.id,
                                            groupIndex,
                                            'key',
                                            event.target.value,
                                          )
                                        }
                                        placeholder="spice-level"
                                        value={group.key}
                                      />
                                    </div>
                                    <div className="field">
                                      <label>Name</label>
                                      <input
                                        onChange={(event) =>
                                          updateModifierGroupField(
                                            menu.id,
                                            groupIndex,
                                            'name',
                                            event.target.value,
                                          )
                                        }
                                        placeholder="Spice level"
                                        value={group.name}
                                      />
                                    </div>
                                    <div className="field">
                                      <label>Minimum selections</label>
                                      <input
                                        min={0}
                                        onChange={(event) =>
                                          updateModifierGroupField(
                                            menu.id,
                                            groupIndex,
                                            'minSelect',
                                            Number.parseInt(event.target.value || '0', 10),
                                          )
                                        }
                                        type="number"
                                        value={group.minSelect}
                                      />
                                    </div>
                                    <div className="field">
                                      <label>Maximum selections</label>
                                      <input
                                        min={1}
                                        onChange={(event) =>
                                          updateModifierGroupField(
                                            menu.id,
                                            groupIndex,
                                            'maxSelect',
                                            Number.parseInt(event.target.value || '1', 10),
                                          )
                                        }
                                        type="number"
                                        value={group.maxSelect}
                                      />
                                    </div>
                                  </div>

                                  <label className="checkbox-row">
                                    <input
                                      checked={group.required}
                                      onChange={(event) =>
                                        updateModifierGroupField(
                                          menu.id,
                                          groupIndex,
                                          'required',
                                          event.target.checked,
                                        )
                                      }
                                      type="checkbox"
                                    />
                                    <span>Guests must choose from this group.</span>
                                  </label>

                                  <div className="section-header">
                                    <div>
                                      <label>Options</label>
                                      <p className="helper-text">
                                        Add each option and its price difference.
                                      </p>
                                    </div>
                                    <button
                                      className="secondary-button"
                                      onClick={() => addModifierOption(menu.id, groupIndex)}
                                      type="button"
                                    >
                                      Add option
                                    </button>
                                  </div>

                                  <div className="editor-stack">
                                    {group.options.map((option, optionIndex) => (
                                      <article
                                        className="sub-editor-card"
                                        key={`${menu.id}-group-${groupIndex}-option-${optionIndex}`}
                                      >
                                        <div className="detail-grid">
                                          <div className="field">
                                            <label>Option name</label>
                                            <input
                                              onChange={(event) =>
                                                updateModifierOptionField(
                                                  menu.id,
                                                  groupIndex,
                                                  optionIndex,
                                                  'name',
                                                  event.target.value,
                                                )
                                              }
                                              placeholder="Extra noodles"
                                              value={option.name}
                                            />
                                          </div>
                                          <div className="field">
                                            <label>Price delta</label>
                                            <input
                                              inputMode="decimal"
                                              onChange={(event) =>
                                                updateModifierOptionField(
                                                  menu.id,
                                                  groupIndex,
                                                  optionIndex,
                                                  'priceDeltaCents',
                                                  parsePriceToCents(event.target.value) ?? 0,
                                                )
                                              }
                                              placeholder="0.00"
                                              value={formatPrice(option.priceDeltaCents, false)}
                                            />
                                          </div>
                                        </div>
                                        <div className="action-row">
                                          <button
                                            className="ghost-button"
                                            disabled={group.options.length <= 1}
                                            onClick={() =>
                                              removeModifierOption(
                                                menu.id,
                                                groupIndex,
                                                optionIndex,
                                              )
                                            }
                                            type="button"
                                          >
                                            Remove option
                                          </button>
                                        </div>
                                      </article>
                                    ))}
                                  </div>
                                </article>
                              ),
                            )}
                          </div>
                        )}

                        <div className="section-header">
                          <div>
                            <label>Categories and items</label>
                            <p className="helper-text">
                              Manage menu structure, assign modifier groups, and
                              define item variants directly here.
                            </p>
                          </div>
                          <button
                            className="secondary-button"
                            onClick={() => addCategory(menu.id)}
                            type="button"
                          >
                            Add category
                          </button>
                        </div>

                        <div className="editor-stack">
                          {(draftContent[menu.id]?.categories ?? []).map(
                            (category, categoryIndex) => (
                              <article className="editor-card" key={`${menu.id}-category-${categoryIndex}`}>
                                <div className="section-header">
                                  <div>
                                    <h4>{category.name || `Category ${categoryIndex + 1}`}</h4>
                                    <p className="helper-text">
                                      Organize visible menu sections for QR and
                                      POS channels.
                                    </p>
                                  </div>
                                  <button
                                    className="ghost-button"
                                    onClick={() =>
                                      removeCategory(menu.id, categoryIndex)
                                    }
                                    type="button"
                                  >
                                    Remove category
                                  </button>
                                </div>

                                <div className="detail-grid">
                                  <div className="field">
                                    <label>Category name</label>
                                    <input
                                      onChange={(event) =>
                                        updateCategoryField(
                                          menu.id,
                                          categoryIndex,
                                          'name',
                                          event.target.value,
                                        )
                                      }
                                      placeholder="Signatures"
                                      value={category.name}
                                    />
                                  </div>
                                </div>

                                <label className="checkbox-row">
                                  <input
                                    checked={category.active ?? true}
                                    onChange={(event) =>
                                      updateCategoryField(
                                        menu.id,
                                        categoryIndex,
                                        'active',
                                        event.target.checked,
                                      )
                                    }
                                    type="checkbox"
                                  />
                                  <span>Category is active and visible.</span>
                                </label>

                                <div className="section-header">
                                  <div>
                                    <label>Items</label>
                                    <p className="helper-text">
                                      Build the items inside this category.
                                    </p>
                                  </div>
                                  <button
                                    className="secondary-button"
                                    onClick={() => addItem(menu.id, categoryIndex)}
                                    type="button"
                                  >
                                    Add item
                                  </button>
                                </div>

                                <div className="editor-stack">
                                  {category.items.map((item, itemIndex) => (
                                    <article
                                      className="sub-editor-card"
                                      key={`${menu.id}-category-${categoryIndex}-item-${itemIndex}`}
                                    >
                                      <div className="section-header">
                                        <div>
                                          <h5>{item.name || `Item ${itemIndex + 1}`}</h5>
                                          <p className="helper-text">
                                            Configure pricing, variants, and
                                            guest choices for this item.
                                          </p>
                                        </div>
                                        <button
                                          className="ghost-button"
                                          onClick={() =>
                                            removeItem(
                                              menu.id,
                                              categoryIndex,
                                              itemIndex,
                                            )
                                          }
                                          type="button"
                                        >
                                          Remove item
                                        </button>
                                      </div>

                                      <div className="detail-grid">
                                        <div className="field">
                                          <label>Item name</label>
                                          <input
                                            onChange={(event) =>
                                              updateItemField(
                                                menu.id,
                                                categoryIndex,
                                                itemIndex,
                                                'name',
                                                event.target.value,
                                              )
                                            }
                                            placeholder="Signature Noodles"
                                            value={item.name}
                                          />
                                        </div>
                                        <div className="field">
                                          <label>SKU</label>
                                          <input
                                            onChange={(event) =>
                                              updateItemField(
                                                menu.id,
                                                categoryIndex,
                                                itemIndex,
                                                'sku',
                                                event.target.value,
                                              )
                                            }
                                            placeholder="SIG-NOODLES"
                                            value={item.sku ?? ''}
                                          />
                                        </div>
                                        <div className="field">
                                          <label>Base price</label>
                                          <input
                                            inputMode="decimal"
                                            onChange={(event) =>
                                              updateItemField(
                                                menu.id,
                                                categoryIndex,
                                                itemIndex,
                                                'basePriceCents',
                                                parsePriceToCents(event.target.value) ?? 0,
                                              )
                                            }
                                            placeholder="6.50"
                                            value={formatPrice(item.basePriceCents, false)}
                                          />
                                        </div>
                                        <div className="field">
                                          <label>Preparation station</label>
                                          <input
                                            onChange={(event) =>
                                              updateItemField(
                                                menu.id,
                                                categoryIndex,
                                                itemIndex,
                                                'preparationStationKey',
                                                slugify(event.target.value) ||
                                                  DEFAULT_PREPARATION_STATION,
                                              )
                                            }
                                            placeholder="main-kitchen"
                                            value={
                                              item.preparationStationKey ??
                                              DEFAULT_PREPARATION_STATION
                                            }
                                          />
                                        </div>
                                      </div>

                                      <div className="field">
                                        <label>Description</label>
                                        <textarea
                                          onChange={(event) =>
                                            updateItemField(
                                              menu.id,
                                              categoryIndex,
                                              itemIndex,
                                              'description',
                                              event.target.value,
                                            )
                                          }
                                          rows={3}
                                          value={item.description ?? ''}
                                        />
                                      </div>

                                      <div className="checkbox-grid">
                                        <label className="checkbox-row">
                                          <input
                                            checked={item.active ?? true}
                                            onChange={(event) =>
                                              updateItemField(
                                                menu.id,
                                                categoryIndex,
                                                itemIndex,
                                                'active',
                                                event.target.checked,
                                              )
                                            }
                                            type="checkbox"
                                          />
                                          <span>Active</span>
                                        </label>
                                        <label className="checkbox-row">
                                          <input
                                            checked={item.taxable ?? true}
                                            onChange={(event) =>
                                              updateItemField(
                                                menu.id,
                                                categoryIndex,
                                                itemIndex,
                                                'taxable',
                                                event.target.checked,
                                              )
                                            }
                                            type="checkbox"
                                          />
                                          <span>Taxable</span>
                                        </label>
                                        <label className="checkbox-row">
                                          <input
                                            checked={item.serviceChargeable ?? true}
                                            onChange={(event) =>
                                              updateItemField(
                                                menu.id,
                                                categoryIndex,
                                                itemIndex,
                                                'serviceChargeable',
                                                event.target.checked,
                                              )
                                            }
                                            type="checkbox"
                                          />
                                          <span>Service chargeable</span>
                                        </label>
                                        <label className="checkbox-row">
                                          <input
                                            checked={item.soldOut ?? false}
                                            onChange={(event) =>
                                              updateItemField(
                                                menu.id,
                                                categoryIndex,
                                                itemIndex,
                                                'soldOut',
                                                event.target.checked,
                                              )
                                            }
                                            type="checkbox"
                                          />
                                          <span>Start as sold out</span>
                                        </label>
                                      </div>

                                      <div className="field">
                                        <label>Assigned modifier groups</label>
                                        <div className="assignment-grid">
                                          {(draftContent[menu.id]?.modifierGroups ?? []).map(
                                            (group) => (
                                              <label
                                                className="checkbox-row"
                                                key={`${menu.id}-${categoryIndex}-${itemIndex}-${group.key}`}
                                              >
                                                <input
                                                  checked={(item.modifierGroupKeys ?? []).includes(
                                                    group.key,
                                                  )}
                                                  onChange={() =>
                                                    toggleItemModifierGroup(
                                                      menu.id,
                                                      categoryIndex,
                                                      itemIndex,
                                                      group.key,
                                                    )
                                                  }
                                                  type="checkbox"
                                                />
                                                <span>
                                                  {group.name || group.key || 'Unnamed group'}
                                                </span>
                                              </label>
                                            ),
                                          )}
                                        </div>
                                        {(draftContent[menu.id]?.modifierGroups ?? []).length ===
                                        0 ? (
                                          <span className="helper-text">
                                            Add modifier groups above to assign
                                            guest choices here.
                                          </span>
                                        ) : null}
                                      </div>

                                      <div className="section-header">
                                        <div>
                                          <label>Variants</label>
                                          <p className="helper-text">
                                            Optional sizes or styles with price
                                            differences.
                                          </p>
                                        </div>
                                        <button
                                          className="secondary-button"
                                          onClick={() =>
                                            addVariant(
                                              menu.id,
                                              categoryIndex,
                                              itemIndex,
                                            )
                                          }
                                          type="button"
                                        >
                                          Add variant
                                        </button>
                                      </div>

                                      {(item.variants ?? []).length > 0 ? (
                                        <div className="editor-stack">
                                          {(item.variants ?? []).map(
                                            (variant, variantIndex) => (
                                              <article
                                                className="sub-editor-card"
                                                key={`${menu.id}-${categoryIndex}-${itemIndex}-variant-${variantIndex}`}
                                              >
                                                <div className="detail-grid">
                                                  <div className="field">
                                                    <label>Variant name</label>
                                                    <input
                                                      onChange={(event) =>
                                                        updateVariantField(
                                                          menu.id,
                                                          categoryIndex,
                                                          itemIndex,
                                                          variantIndex,
                                                          'name',
                                                          event.target.value,
                                                        )
                                                      }
                                                      placeholder="Large"
                                                      value={variant.name}
                                                    />
                                                  </div>
                                                  <div className="field">
                                                    <label>Price delta</label>
                                                    <input
                                                      inputMode="decimal"
                                                      onChange={(event) =>
                                                        updateVariantField(
                                                          menu.id,
                                                          categoryIndex,
                                                          itemIndex,
                                                          variantIndex,
                                                          'priceDeltaCents',
                                                          parsePriceToCents(
                                                            event.target.value,
                                                          ) ?? 0,
                                                        )
                                                      }
                                                      placeholder="1.00"
                                                      value={formatPrice(
                                                        variant.priceDeltaCents,
                                                        false,
                                                      )}
                                                    />
                                                  </div>
                                                </div>
                                                <div className="action-row">
                                                  <button
                                                    className="ghost-button"
                                                    onClick={() =>
                                                      removeVariant(
                                                        menu.id,
                                                        categoryIndex,
                                                        itemIndex,
                                                        variantIndex,
                                                      )
                                                    }
                                                    type="button"
                                                  >
                                                    Remove variant
                                                  </button>
                                                </div>
                                              </article>
                                            ),
                                          )}
                                        </div>
                                      ) : (
                                        <span className="helper-text">
                                          No variants yet for this item.
                                        </span>
                                      )}
                                    </article>
                                  ))}
                                </div>
                              </article>
                            ),
                          )}
                        </div>
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

function versionToDraftContent(
  version: MenuDetail['versions'][number] | undefined,
): DraftMenuContent {
  if (!version) {
    return createEmptyDraftContent();
  }

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
        preparationStationKey:
          item.preparationStationKey ?? DEFAULT_PREPARATION_STATION,
        active: item.active,
        soldOut: item.soldOut,
        displayOrder: item.displayOrder,
        variants: item.variants.map((variant) => ({
          name: variant.name,
          priceDeltaCents: variant.priceDeltaCents,
          displayOrder: variant.displayOrder,
        })),
        modifierGroupKeys: item.itemModifierGroups.map(
          ({ modifierGroup }) => modifierGroup.key,
        ),
      })),
    })),
  };
}

function createEmptyDraftContent(): DraftMenuContent {
  return {
    modifierGroups: [],
    categories: [createEmptyCategory(0)],
  };
}

function createEmptyModifierGroup(index: number): DraftModifierGroup {
  return {
    key: `modifier-group-${index + 1}`,
    name: '',
    minSelect: 0,
    maxSelect: 1,
    required: false,
    displayOrder: index,
    options: [createEmptyModifierOption(0)],
  };
}

function createEmptyModifierOption(index: number): DraftModifierOption {
  return {
    name: '',
    priceDeltaCents: 0,
    displayOrder: index,
  };
}

function createEmptyCategory(index: number): DraftMenuCategory {
  return {
    name: '',
    displayOrder: index,
    active: true,
    items: [createEmptyItem(0)],
  };
}

function createEmptyItem(index: number): DraftMenuItem {
  return {
    name: '',
    basePriceCents: 0,
    taxable: true,
    serviceChargeable: true,
    preparationStationKey: DEFAULT_PREPARATION_STATION,
    active: true,
    soldOut: false,
    displayOrder: index,
    variants: [],
    modifierGroupKeys: [],
  };
}

function createEmptyVariant(index: number): DraftVariant {
  return {
    name: '',
    priceDeltaCents: 0,
    displayOrder: index,
  };
}

function summarizeDraftContent(content: DraftMenuContent) {
  const categories = content.categories.length;
  const items = content.categories.reduce(
    (sum, category) => sum + category.items.length,
    0,
  );
  const variants = content.categories.reduce(
    (sum, category) =>
      sum +
      category.items.reduce(
        (itemSum, item) => itemSum + (item.variants?.length ?? 0),
        0,
      ),
    0,
  );
  const soldOutItems = content.categories.reduce(
    (sum, category) =>
      sum + category.items.filter((item) => item.soldOut).length,
    0,
  );
  const modifierGroups = content.modifierGroups.length;
  return {
    categories,
    items,
    variants,
    soldOutItems,
    modifierGroups,
  };
}

function summarizeMenuVersion(version: MenuDetail['versions'][number] | undefined) {
  if (!version) {
    return {
      categories: 0,
      items: 0,
      variants: 0,
      soldOutItems: 0,
      modifierGroups: 0,
    };
  }

  const categories = version.categories.length;
  const items = version.categories.reduce(
    (sum, category) => sum + category.items.length,
    0,
  );
  const variants = version.categories.reduce(
    (sum, category) =>
      sum +
      category.items.reduce(
        (itemSum, item) => itemSum + item.variants.length,
        0,
      ),
    0,
  );
  const soldOutItems = version.categories.reduce(
    (sum, category) =>
      sum + category.items.filter((item) => item.soldOut).length,
    0,
  );
  const modifierGroups = version.modifierGroups.length;
  return {
    categories,
    items,
    variants,
    soldOutItems,
    modifierGroups,
  };
}

function buildDraftDiff(
  content: DraftMenuContent,
  version: MenuDetail['versions'][number] | undefined,
) {
  const draft = summarizeDraftContent(content);
  const published = summarizeMenuVersion(version);
  return {
    categories: draft.categories - published.categories,
    items: draft.items - published.items,
    variants: draft.variants - published.variants,
    soldOutItems: draft.soldOutItems - published.soldOutItems,
    modifierGroups: draft.modifierGroups - published.modifierGroups,
  };
}

function getDraftReadinessIssues(content: DraftMenuContent) {
  const issues: string[] = [];

  if (content.categories.length === 0) {
    issues.push('Add at least one category.');
  }

  const categoryNames = content.categories
    .map((category) => category.name.trim().toLowerCase())
    .filter(Boolean);
  if (new Set(categoryNames).size !== categoryNames.length) {
    issues.push('Category names should be unique.');
  }

  const modifierKeys = content.modifierGroups
    .map((group) => group.key.trim())
    .filter(Boolean);
  if (new Set(modifierKeys).size !== modifierKeys.length) {
    issues.push('Modifier group keys should be unique.');
  }

  const knownModifierKeys = new Set(modifierKeys);
  const skus: string[] = [];

  for (const category of content.categories) {
    if (!category.name.trim()) {
      issues.push('Every category needs a name.');
      break;
    }
    if (category.items.length === 0) {
      issues.push(`Category "${category.name}" has no items.`);
    }

    for (const item of category.items) {
      if (item.sku?.trim()) {
        skus.push(item.sku.trim().toLowerCase());
      }
      if (!item.name.trim()) {
        issues.push(`An item in "${category.name}" is missing a name.`);
      }
      if ((item.preparationStationKey ?? '').trim().length === 0) {
        issues.push(`Item "${item.name || 'Untitled item'}" needs a preparation station key.`);
      }
      for (const key of item.modifierGroupKeys ?? []) {
        if (!knownModifierKeys.has(key)) {
          issues.push(
            `Item "${item.name || 'Untitled item'}" references missing modifier group "${key}".`,
          );
        }
      }
      if ((item.variants ?? []).some((variant) => !variant.name.trim())) {
        issues.push(`All variants for "${item.name || 'Untitled item'}" need names.`);
      }
    }
  }

  if (new Set(skus).size !== skus.length) {
    issues.push('Item SKUs should be unique within the menu.');
  }

  for (const group of content.modifierGroups) {
    if (!group.key.trim()) {
      issues.push('Every modifier group needs a key.');
    }
    if (!group.name.trim()) {
      issues.push(`Modifier group "${group.key || 'untitled'}" needs a name.`);
    }
    if (group.options.length === 0) {
      issues.push(`Modifier group "${group.name || group.key || 'untitled'}" needs at least one option.`);
    }
    if (group.minSelect > group.maxSelect) {
      issues.push(`Modifier group "${group.name || group.key || 'untitled'}" has min selections greater than max selections.`);
    }
    if (group.required && group.minSelect < 1) {
      issues.push(`Required modifier group "${group.name || group.key || 'untitled'}" must require at least one selection.`);
    }
    if (
      group.options.some((option) => !option.name.trim())
    ) {
      issues.push(`All options in "${group.name || group.key || 'untitled'}" need names.`);
    }
  }

  return [...new Set(issues)];
}

function formatSignedDiff(value: number) {
  if (value > 0) {
    return `+${value}`;
  }
  return `${value}`;
}

function formatPrice(cents: number, withCurrency = true) {
  const amount = (cents / 100).toFixed(2);
  return withCurrency ? `$${amount}` : amount;
}
