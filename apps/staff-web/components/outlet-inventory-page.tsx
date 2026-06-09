'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  createInventoryItem,
  getInventory,
  getInventoryMovements,
  getMenuDetail,
  getMenus,
  recordInventoryMovement,
  recordInventoryStockCount,
  updateInventoryItem,
  upsertInventoryRecipe,
} from '@/lib/api';
import type {
  InventoryItemSummary,
  InventoryListResponse,
  InventoryMovementEntry,
  InventoryRecipeSummary,
  StaffMenuDetail,
} from '@/lib/types';
import {
  OutletHeader,
  OutletPageLayout,
  useOutletContext,
} from './outlet-page-base';

type MovementMode = 'stock-in' | 'wastage' | 'adjustment' | 'stock-count';

interface RecipeIngredientDraft {
  inventoryItemId: string;
  quantity: string;
  unit: string;
}

export function OutletInventoryPage() {
  const { session, outlet, outletId, error: outletError, busy: outletBusy } =
    useOutletContext();
  const [inventory, setInventory] = useState<InventoryListResponse | null>(null);
  const [movements, setMovements] = useState<InventoryMovementEntry[]>([]);
  const [menuDetails, setMenuDetails] = useState<StaffMenuDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({
    sku: '',
    name: '',
    category: '',
    baseUnit: 'pcs',
    purchaseUnit: '',
    reorderPoint: '',
  });
  const [movementMode, setMovementMode] = useState<MovementMode>('stock-in');
  const [movementItemId, setMovementItemId] = useState('');
  const [movementQuantity, setMovementQuantity] = useState('');
  const [movementReason, setMovementReason] = useState('');
  const [recipeMenuItemId, setRecipeMenuItemId] = useState('');
  const [recipeSaleDeductionEnabled, setRecipeSaleDeductionEnabled] =
    useState(true);
  const [recipeReason, setRecipeReason] = useState(
    'Mapped recipe for inventory deduction.',
  );
  const [recipeIngredients, setRecipeIngredients] = useState<
    RecipeIngredientDraft[]
  >([{ inventoryItemId: '', quantity: '', unit: 'pcs' }]);

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
        const [inventoryResponse, movementResponse, menus] = await Promise.all([
          getInventory(authToken, outletId),
          getInventoryMovements(authToken, outletId, { limit: 50 }),
          getMenus(authToken, outletId),
        ]);
        const details = await Promise.all(
          menus.map((menu) => getMenuDetail(authToken, outletId, menu.id)),
        );
        if (!cancelled) {
          setInventory(inventoryResponse);
          setMovements(movementResponse.movements);
          setMenuDetails(details);
          setMovementItemId((current) => current || inventoryResponse.items[0]?.id || '');
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Inventory data failed to load.',
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

  const publishedMenuItems = useMemo(() => {
    return menuDetails.flatMap((menu) => {
      const published =
        menu.versions.find((version) => version.status === 'PUBLISHED') ?? null;
      if (!published) {
        return [];
      }
      return published.categories.flatMap((category) =>
        category.items.map((item) => ({
          id: item.id,
          name: item.name,
          sku: item.sku,
          menuName: menu.name,
        })),
      );
    });
  }, [menuDetails]);

  const lowStockItems = useMemo(
    () => inventory?.items.filter((item) => item.lowStock) ?? [],
    [inventory],
  );

  const activeItems = useMemo(
    () => inventory?.items.filter((item) => item.active) ?? [],
    [inventory],
  );

  const selectedMovementItem =
    inventory?.items.find((item) => item.id === movementItemId) ?? null;

  async function reloadData() {
    if (!session?.accessToken) {
      return;
    }
    const [inventoryResponse, movementResponse] = await Promise.all([
      getInventory(session.accessToken, outletId),
      getInventoryMovements(session.accessToken, outletId, { limit: 50 }),
    ]);
    setInventory(inventoryResponse);
    setMovements(movementResponse.movements);
  }

  async function handleCreateItem() {
    if (!session?.accessToken) {
      return;
    }
    if (!newItem.name.trim() || !newItem.baseUnit.trim()) {
      setError('Item name and base unit are required.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await createInventoryItem(session.accessToken, outletId, {
        ...(newItem.sku.trim() ? { sku: newItem.sku.trim() } : {}),
        name: newItem.name.trim(),
        ...(newItem.category.trim() ? { category: newItem.category.trim() } : {}),
        baseUnit: newItem.baseUnit.trim(),
        ...(newItem.purchaseUnit.trim()
          ? { purchaseUnit: newItem.purchaseUnit.trim() }
          : {}),
        ...(newItem.reorderPoint.trim()
          ? { reorderPoint: Number(newItem.reorderPoint) }
          : {}),
      });
      setNewItem({
        sku: '',
        name: '',
        category: '',
        baseUnit: 'pcs',
        purchaseUnit: '',
        reorderPoint: '',
      });
      await reloadData();
      setSuccess('Inventory item created.');
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : 'Failed to create the inventory item.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRecordMovement() {
    if (!session?.accessToken || !movementItemId) {
      return;
    }
    const quantity = Number(movementQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('Enter a valid movement quantity.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      if (movementMode === 'stock-count') {
        await recordInventoryStockCount(session.accessToken, outletId, {
          inventoryItemId: movementItemId,
          actualQuantity: quantity,
          reason:
            movementReason.trim() || 'Staff recorded a stock count adjustment.',
        });
      } else {
        await recordInventoryMovement(
          session.accessToken,
          outletId,
          movementMode,
          {
            inventoryItemId: movementItemId,
            quantity,
            ...(movementReason.trim() ? { reason: movementReason.trim() } : {}),
          },
        );
      }
      setMovementQuantity('');
      setMovementReason('');
      await reloadData();
      setSuccess('Inventory movement recorded.');
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : 'Failed to record the inventory movement.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRecipeSave() {
    if (!session?.accessToken || !recipeMenuItemId) {
      setError('Choose a menu item to map a recipe.');
      return;
    }

    const ingredients = recipeIngredients
      .map((ingredient) => ({
        inventoryItemId: ingredient.inventoryItemId,
        quantity: Number(ingredient.quantity),
        unit: ingredient.unit.trim(),
      }))
      .filter(
        (ingredient) =>
          ingredient.inventoryItemId &&
          Number.isFinite(ingredient.quantity) &&
          ingredient.quantity > 0 &&
          ingredient.unit,
      );

    if (ingredients.length === 0) {
      setError('Add at least one valid recipe ingredient.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await upsertInventoryRecipe(
        session.accessToken,
        outletId,
        recipeMenuItemId,
        {
          active: true,
          saleDeductionEnabled: recipeSaleDeductionEnabled,
          reason: recipeReason.trim() || 'Updated recipe deduction mapping.',
          ingredients,
        },
      );
      await reloadData();
      setSuccess('Recipe saved.');
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : 'Failed to save the recipe.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleItem(item: InventoryItemSummary) {
    if (!session?.accessToken) {
      return;
    }
    const reason =
      typeof window !== 'undefined'
        ? window.prompt(
            item.active
              ? 'Why are you deactivating this inventory item?'
              : 'Why are you reactivating this inventory item?',
            item.active
              ? 'Item retired from current purchasing.'
              : 'Item restored to active use.',
          )
        : null;
    if (!reason?.trim()) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await updateInventoryItem(session.accessToken, outletId, item.id, {
        active: !item.active,
        reason: reason.trim(),
      });
      await reloadData();
      setSuccess(`Inventory item ${item.active ? 'deactivated' : 'reactivated'}.`);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : 'Failed to update the inventory item.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (outletBusy || loading) {
    return (
      <OutletPageLayout
        title="Inventory"
        subtitle="Loading stock levels, movement history, and recipe links."
      >
        <section className="panel section-panel">
          <p>Loading inventory operations...</p>
        </section>
      </OutletPageLayout>
    );
  }

  if (!session || !outlet || outletError) {
    return (
      <OutletPageLayout
        title="Inventory"
        subtitle="Run stock control, counts, and recipe deduction from one station."
      >
        <section className="panel section-panel">
          <div className="alert error">
            {outletError ?? 'Outlet context unavailable.'}
          </div>
        </section>
      </OutletPageLayout>
    );
  }

  return (
    <OutletPageLayout
      title="Inventory"
      subtitle="Run counts, movement, and sale deduction without leaving service."
    >
      <OutletHeader outlet={outlet} />

      {error ? (
        <section className="panel section-panel">
          <div className="alert error">{error}</div>
        </section>
      ) : null}
      {success ? (
        <section className="panel section-panel">
          <div className="alert success">{success}</div>
        </section>
      ) : null}

      <section className="operations-layout support-station-layout">
        <aside className="panel section-panel support-control-rail">
          <article className="support-config-card">
            <div className="support-config-card__header">
              <div>
                <p className="eyebrow">Stock station</p>
                <h2 className="section-title">Control rail</h2>
              </div>
              <span className="status-pill warning">
                {lowStockItems.length} low
              </span>
            </div>
            <p className="supporting-copy">
              Receive stock, record wastage, run counts, and connect recipes to
              menu items without leaving the service console.
            </p>
            <div className="support-inline-meta">
              <span>{inventory?.items.length ?? 0} items</span>
              <span>{activeItems.length} active</span>
              <span>{inventory?.recipes.length ?? 0} recipes</span>
              <span>{movements.length} recent moves</span>
            </div>
          </article>

          <article className="support-config-card">
            <div className="support-config-card__header">
              <div>
                <p className="eyebrow">Item master</p>
                <h3>Add stock item</h3>
              </div>
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="inventorySku">SKU</label>
                <input
                  id="inventorySku"
                  onChange={(event) =>
                    setNewItem((current) => ({
                      ...current,
                      sku: event.target.value,
                    }))
                  }
                  value={newItem.sku}
                />
              </div>
              <div className="field">
                <label htmlFor="inventoryName">Name</label>
                <input
                  id="inventoryName"
                  onChange={(event) =>
                    setNewItem((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  value={newItem.name}
                />
              </div>
              <div className="field">
                <label htmlFor="inventoryCategory">Category</label>
                <input
                  id="inventoryCategory"
                  onChange={(event) =>
                    setNewItem((current) => ({
                      ...current,
                      category: event.target.value,
                    }))
                  }
                  value={newItem.category}
                />
              </div>
              <div className="field">
                <label htmlFor="inventoryBaseUnit">Base unit</label>
                <input
                  id="inventoryBaseUnit"
                  onChange={(event) =>
                    setNewItem((current) => ({
                      ...current,
                      baseUnit: event.target.value,
                    }))
                  }
                  value={newItem.baseUnit}
                />
              </div>
              <div className="field">
                <label htmlFor="inventoryPurchaseUnit">Purchase unit</label>
                <input
                  id="inventoryPurchaseUnit"
                  onChange={(event) =>
                    setNewItem((current) => ({
                      ...current,
                      purchaseUnit: event.target.value,
                    }))
                  }
                  value={newItem.purchaseUnit}
                />
              </div>
              <div className="field">
                <label htmlFor="inventoryReorderPoint">Reorder point</label>
                <input
                  id="inventoryReorderPoint"
                  inputMode="decimal"
                  onChange={(event) =>
                    setNewItem((current) => ({
                      ...current,
                      reorderPoint: event.target.value,
                    }))
                  }
                  value={newItem.reorderPoint}
                />
              </div>
            </div>
            <div className="support-card__actions">
              <button
                className="primary-button"
                disabled={submitting}
                onClick={() => void handleCreateItem()}
                type="button"
              >
                {submitting ? 'Saving...' : 'Create item'}
              </button>
            </div>
          </article>

          <article className="support-config-card">
            <div className="support-config-card__header">
              <div>
                <p className="eyebrow">Movement</p>
                <h3>Adjust stock</h3>
              </div>
              {selectedMovementItem ? (
                <span className="status-pill neutral">
                  {selectedMovementItem.stockOnHand} {selectedMovementItem.baseUnit}
                </span>
              ) : null}
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="movementMode">Movement type</label>
                <select
                  id="movementMode"
                  onChange={(event) =>
                    setMovementMode(event.target.value as MovementMode)
                  }
                  value={movementMode}
                >
                  <option value="stock-in">Stock in</option>
                  <option value="wastage">Wastage</option>
                  <option value="adjustment">Adjustment</option>
                  <option value="stock-count">Stock count</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="movementItemId">Inventory item</label>
                <select
                  id="movementItemId"
                  onChange={(event) => setMovementItemId(event.target.value)}
                  value={movementItemId}
                >
                  <option value="">Select item</option>
                  {inventory?.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.stockOnHand} {item.baseUnit})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="movementQuantity">
                  {movementMode === 'stock-count' ? 'Actual qty' : 'Quantity'}
                </label>
                <input
                  id="movementQuantity"
                  inputMode="decimal"
                  onChange={(event) => setMovementQuantity(event.target.value)}
                  value={movementQuantity}
                />
              </div>
              <div className="field">
                <label htmlFor="movementReason">Reason</label>
                <input
                  id="movementReason"
                  onChange={(event) => setMovementReason(event.target.value)}
                  placeholder="Receiving, wastage, recount, breakage"
                  value={movementReason}
                />
              </div>
            </div>
            <div className="support-card__actions">
              <button
                className="primary-button"
                disabled={submitting || !inventory?.items.length}
                onClick={() => void handleRecordMovement()}
                type="button"
              >
                {submitting ? 'Saving...' : 'Record movement'}
              </button>
            </div>
          </article>

          <article className="support-config-card">
            <div className="support-config-card__header">
              <div>
                <p className="eyebrow">Recipe mapping</p>
                <h3>Link item deduction</h3>
              </div>
            </div>
            <div className="field">
              <label htmlFor="recipeMenuItem">Menu item</label>
              <select
                id="recipeMenuItem"
                onChange={(event) => setRecipeMenuItemId(event.target.value)}
                value={recipeMenuItemId}
              >
                <option value="">Choose a published menu item</option>
                {publishedMenuItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.menuName})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="recipeReason">Reason</label>
              <input
                id="recipeReason"
                onChange={(event) => setRecipeReason(event.target.value)}
                value={recipeReason}
              />
            </div>
            <label className="checkbox-row">
              <input
                checked={recipeSaleDeductionEnabled}
                onChange={(event) =>
                  setRecipeSaleDeductionEnabled(event.target.checked)
                }
                type="checkbox"
              />
              <span>Enable sale deduction</span>
            </label>
            <div className="support-config-stack">
              {recipeIngredients.map((ingredient, index) => (
                <div className="support-card" key={`${ingredient.inventoryItemId}-${index}`}>
                  <div className="form-grid">
                    <div className="field">
                      <label>Inventory item</label>
                      <select
                        onChange={(event) =>
                          setRecipeIngredients((current) =>
                            current.map((entry, entryIndex) =>
                              entryIndex === index
                                ? {
                                    ...entry,
                                    inventoryItemId: event.target.value,
                                  }
                                : entry,
                            ),
                          )
                        }
                        value={ingredient.inventoryItemId}
                      >
                        <option value="">Choose an item</option>
                        {inventory?.items.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>Quantity</label>
                      <input
                        inputMode="decimal"
                        onChange={(event) =>
                          setRecipeIngredients((current) =>
                            current.map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, quantity: event.target.value }
                                : entry,
                            ),
                          )
                        }
                        value={ingredient.quantity}
                      />
                    </div>
                    <div className="field">
                      <label>Unit</label>
                      <input
                        onChange={(event) =>
                          setRecipeIngredients((current) =>
                            current.map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, unit: event.target.value }
                                : entry,
                            ),
                          )
                        }
                        value={ingredient.unit}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="support-card__actions">
              <button
                className="secondary-button"
                onClick={() =>
                  setRecipeIngredients((current) => [
                    ...current,
                    { inventoryItemId: '', quantity: '', unit: 'pcs' },
                  ])
                }
                type="button"
              >
                Add ingredient row
              </button>
              <button
                className="primary-button"
                disabled={
                  submitting ||
                  !inventory?.items.length ||
                  !publishedMenuItems.length
                }
                onClick={() => void handleRecipeSave()}
                type="button"
              >
                {submitting ? 'Saving...' : 'Save recipe'}
              </button>
            </div>
          </article>
        </aside>

        <div className="support-board-panel">
          <section className="support-summary-grid">
            <article className="support-card">
              <div className="support-card__header">
                <div>
                  <p className="eyebrow">Stock masters</p>
                  <h3>{inventory?.items.length ?? 0}</h3>
                </div>
                <span className="status-pill neutral">Catalog</span>
              </div>
              <p className="supporting-copy">
                Ingredients and supply items configured for this outlet.
              </p>
            </article>
            <article className="support-card">
              <div className="support-card__header">
                <div>
                  <p className="eyebrow">Low stock</p>
                  <h3>{lowStockItems.length}</h3>
                </div>
                <span className="status-pill warning">Reorder</span>
              </div>
              <p className="supporting-copy">
                Items already at or below their reorder point.
              </p>
            </article>
            <article className="support-card">
              <div className="support-card__header">
                <div>
                  <p className="eyebrow">Recipes</p>
                  <h3>{inventory?.recipes.length ?? 0}</h3>
                </div>
                <span className="status-pill success">Mapped</span>
              </div>
              <p className="supporting-copy">
                Menu items connected to deduction logic.
              </p>
            </article>
            <article className="support-card">
              <div className="support-card__header">
                <div>
                  <p className="eyebrow">Recent moves</p>
                  <h3>{movements.length}</h3>
                </div>
                <span className="status-pill neutral">Ledger</span>
              </div>
              <p className="supporting-copy">
                Stock-ins, wastage, counts, and adjustments in the latest feed.
              </p>
            </article>
          </section>

          <section className="support-card-grid">
            <article className="panel section-panel support-card">
              <div className="support-card__header">
                <div>
                  <p className="eyebrow">Immediate attention</p>
                  <h2 className="section-title">Low stock board</h2>
                </div>
                <span className="status-pill warning">
                  {lowStockItems.length} flagged
                </span>
              </div>
              {lowStockItems.length === 0 ? (
                <p className="supporting-copy">
                  No low-stock alerts right now.
                </p>
              ) : (
                <div className="list-block">
                  {lowStockItems.map((item) => (
                    <article className="list-item" key={item.id}>
                      <div className="support-list-card__header">
                        <div>
                          <h3>{item.name}</h3>
                          <p className="supporting-copy">
                            {item.category ?? 'Uncategorized'}
                          </p>
                        </div>
                        <span className="status-pill warning">Low stock</span>
                      </div>
                      <div className="support-inline-meta">
                        <span>
                          On hand: {item.stockOnHand} {item.baseUnit}
                        </span>
                        <span>
                          Reorder: {item.reorderPoint} {item.baseUnit}
                        </span>
                        <span>{item.purchaseUnit || 'No purchase unit'}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </article>

            <article className="panel section-panel support-card">
              <div className="support-card__header">
                <div>
                  <p className="eyebrow">Item register</p>
                  <h2 className="section-title">Current balances</h2>
                </div>
                <span className="status-pill neutral">Live stock</span>
              </div>
              <div className="table-shell">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>SKU</th>
                      <th>On hand</th>
                      <th>Reorder</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {inventory?.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.name}</strong>
                          <div>{item.category ?? 'Uncategorized'}</div>
                        </td>
                        <td>{item.sku ?? 'N/A'}</td>
                        <td>
                          {item.stockOnHand} {item.baseUnit}
                        </td>
                        <td>
                          {item.reorderPoint} {item.baseUnit}
                        </td>
                        <td>
                          <span
                            className={`status-pill ${
                              item.lowStock
                                ? 'warning'
                                : item.active
                                  ? 'success'
                                  : 'neutral'
                            }`}
                          >
                            {item.lowStock
                              ? 'Low stock'
                              : item.active
                                ? 'Active'
                                : 'Inactive'}
                          </span>
                        </td>
                        <td>
                          <button
                            className="secondary-button"
                            onClick={() => void handleToggleItem(item)}
                            type="button"
                          >
                            {item.active ? 'Deactivate' : 'Reactivate'}
                          </button>
                        </td>
                      </tr>
                    )) ?? null}
                  </tbody>
                </table>
              </div>
            </article>
          </section>

          <section className="support-list-grid">
            <article className="panel section-panel support-list-card">
              <div className="support-list-card__header">
                <div>
                  <p className="eyebrow">Movement ledger</p>
                  <h2 className="section-title">Recent activity</h2>
                </div>
                <span className="status-pill neutral">{movements.length} moves</span>
              </div>
              <div className="list-block">
                {movements.map((movement) => (
                  <article className="list-item" key={movement.id}>
                    <div className="support-list-card__header">
                      <div>
                        <h3>{movement.inventoryItem.name}</h3>
                        <p className="supporting-copy">
                          {formatMovementType(movement.movementType)}
                        </p>
                      </div>
                      <span className="status-pill neutral">
                        {movement.quantityDelta} {movement.unit}
                      </span>
                    </div>
                    <div className="support-inline-meta">
                      <span>{formatDateTime(movement.createdAt)}</span>
                      <span>{movement.reason ?? 'No reason provided'}</span>
                    </div>
                  </article>
                ))}
              </div>
            </article>

            <article className="panel section-panel support-list-card">
              <div className="support-list-card__header">
                <div>
                  <p className="eyebrow">Deduction rules</p>
                  <h2 className="section-title">Recipe mappings</h2>
                </div>
                <span className="status-pill success">
                  {inventory?.recipes.length ?? 0} active
                </span>
              </div>
              {(inventory?.recipes ?? []).length === 0 ? (
                <p className="supporting-copy">
                  No deduction recipes have been mapped yet.
                </p>
              ) : (
                <div className="list-block">
                  {(inventory?.recipes ?? []).map((recipe: InventoryRecipeSummary) => (
                    <article className="list-item" key={recipe.id}>
                      <div className="support-list-card__header">
                        <div>
                          <h3>{recipe.menuItemName}</h3>
                          <p className="supporting-copy">
                            {recipe.saleDeductionEnabled
                              ? 'Sale deduction enabled'
                              : 'Mapped but paused'}
                          </p>
                        </div>
                        <span
                          className={`status-pill ${
                            recipe.saleDeductionEnabled ? 'success' : 'neutral'
                          }`}
                        >
                          {recipe.saleDeductionEnabled ? 'Live' : 'Paused'}
                        </span>
                      </div>
                      <div className="tag-row">
                        {recipe.ingredients.map((ingredient) => (
                          <span
                            className="tag"
                            key={`${recipe.id}-${ingredient.inventoryItemId}`}
                          >
                            {ingredient.inventoryItemName}: {ingredient.quantity}{' '}
                            {ingredient.unit}
                          </span>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </article>
          </section>
        </div>
      </section>
    </OutletPageLayout>
  );
}

function formatMovementType(value: InventoryMovementEntry['movementType']) {
  return value
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
