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
  MenuDetail,
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
  const [menuDetails, setMenuDetails] = useState<MenuDetail[]>([]);
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
          setMovementItemId(inventoryResponse.items[0]?.id ?? '');
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
            movementReason.trim() || 'Owner recorded a stock count adjustment.',
        });
      } else {
        await recordInventoryMovement(session.accessToken, outletId, movementMode, {
          inventoryItemId: movementItemId,
          quantity,
          ...(movementReason.trim() ? { reason: movementReason.trim() } : {}),
        });
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
      await upsertInventoryRecipe(session.accessToken, outletId, recipeMenuItemId, {
        active: true,
        saleDeductionEnabled: recipeSaleDeductionEnabled,
        reason: recipeReason.trim() || 'Updated recipe deduction mapping.',
        ingredients,
      });
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
            item.active ? 'Item retired from current purchasing.' : 'Item restored to active use.',
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
        subtitle="Loading item balances, movements, and recipe mappings."
      >
        <section className="section-panel">
          <p>Loading inventory operations...</p>
        </section>
      </OutletPageLayout>
    );
  }

  if (!session || !outlet || outletError) {
    return (
      <OutletPageLayout
        title="Inventory"
        subtitle="Inventory lite tools for stock operations and BOM mapping."
      >
        <section className="section-panel">
          <div className="alert error">{outletError ?? 'Outlet context unavailable.'}</div>
        </section>
      </OutletPageLayout>
    );
  }

  return (
    <OutletPageLayout
      title="Inventory"
      subtitle="Inventory lite for item master, stock movement, and sale-deduction recipes."
    >
      <OutletHeader outlet={outlet} />

      {error ? (
        <section className="section-panel">
          <div className="alert error">{error}</div>
        </section>
      ) : null}
      {success ? (
        <section className="section-panel">
          <div className="alert success">{success}</div>
        </section>
      ) : null}

      <section className="section-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Inventory health</p>
            <h2 className="serif">Outlet stock overview</h2>
            <p>Keep a lightweight live view of stock, recipes, and adjustments.</p>
          </div>
        </div>
        <div className="stats-grid">
          <article className="stat-card">
            <span className="metric-label">Inventory items</span>
            <strong>{inventory?.items.length ?? 0}</strong>
          </article>
          <article className="stat-card">
            <span className="metric-label">Low stock alerts</span>
            <strong>{lowStockItems.length}</strong>
          </article>
          <article className="stat-card">
            <span className="metric-label">Recipe mappings</span>
            <strong>{inventory?.recipes.length ?? 0}</strong>
          </article>
          <article className="stat-card">
            <span className="metric-label">Recent movements</span>
            <strong>{movements.length}</strong>
          </article>
        </div>
      </section>

      <section className="section-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Item master</p>
            <h2 className="serif">Create inventory items</h2>
          </div>
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="inventorySku">SKU</label>
            <input
              id="inventorySku"
              onChange={(event) =>
                setNewItem((current) => ({ ...current, sku: event.target.value }))
              }
              value={newItem.sku}
            />
          </div>
          <div className="field">
            <label htmlFor="inventoryName">Name</label>
            <input
              id="inventoryName"
              onChange={(event) =>
                setNewItem((current) => ({ ...current, name: event.target.value }))
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
        <div className="inline-actions">
          <button
            className="primary-button"
            disabled={submitting}
            onClick={() => void handleCreateItem()}
            type="button"
          >
            {submitting ? 'Saving item...' : 'Create inventory item'}
          </button>
        </div>
      </section>

      <section className="section-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Stock movement</p>
            <h2 className="serif">Record stock changes</h2>
          </div>
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="movementMode">Movement type</label>
            <select
              id="movementMode"
              onChange={(event) => setMovementMode(event.target.value as MovementMode)}
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
              {inventory?.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.stockOnHand} {item.baseUnit})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="movementQuantity">
              {movementMode === 'stock-count' ? 'Actual quantity' : 'Quantity'}
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
              value={movementReason}
            />
          </div>
        </div>
        <div className="inline-actions">
          <button
            className="primary-button"
            disabled={submitting || !inventory?.items.length}
            onClick={() => void handleRecordMovement()}
            type="button"
          >
            {submitting ? 'Saving movement...' : 'Record movement'}
          </button>
        </div>
      </section>

      <section className="section-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Recipe / BOM</p>
            <h2 className="serif">Map menu items to ingredient deduction</h2>
          </div>
        </div>
        <div className="form-grid">
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
          <div className="field checkbox-field">
            <label>
              <input
                checked={recipeSaleDeductionEnabled}
                onChange={(event) =>
                  setRecipeSaleDeductionEnabled(event.target.checked)
                }
                type="checkbox"
              />{' '}
              Enable sale deduction for this recipe
            </label>
          </div>
        </div>
        <div className="stack-list">
          {recipeIngredients.map((ingredient, index) => (
            <div className="form-grid" key={`${ingredient.inventoryItemId}-${index}`}>
              <div className="field">
                <label>Inventory item</label>
                <select
                  onChange={(event) =>
                    setRecipeIngredients((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index
                          ? { ...entry, inventoryItemId: event.target.value }
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
          ))}
        </div>
        <div className="inline-actions">
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
            disabled={submitting || !inventory?.items.length || !publishedMenuItems.length}
            onClick={() => void handleRecipeSave()}
            type="button"
          >
            {submitting ? 'Saving recipe...' : 'Save recipe'}
          </button>
        </div>
      </section>

      <section className="section-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Stock register</p>
            <h2 className="serif">Current balances</h2>
          </div>
        </div>
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>SKU</th>
                <th>On hand</th>
                <th>Reorder point</th>
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
                  <td>{item.sku ?? '—'}</td>
                  <td>
                    {item.stockOnHand} {item.baseUnit}
                  </td>
                  <td>
                    {item.reorderPoint} {item.baseUnit}
                  </td>
                  <td>
                    <span className={`status-pill ${item.lowStock ? 'warning' : item.active ? 'success' : 'neutral'}`}>
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
      </section>

      <section className="section-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Recent activity</p>
            <h2 className="serif">Latest stock movements</h2>
          </div>
        </div>
        <div className="stack-list">
          {movements.map((movement) => (
            <article className="sub-panel" key={movement.id}>
              <div className="section-header">
                <div>
                  <strong>{movement.inventoryItem.name}</strong>
                  <p>
                    {formatMovementType(movement.movementType)} • {movement.quantityDelta}{' '}
                    {movement.unit}
                  </p>
                </div>
                <span className="supporting-copy">
                  {formatDateTime(movement.createdAt)}
                </span>
              </div>
              <p className="supporting-copy">
                {movement.reason ?? 'No reason provided.'}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Recipe mappings</p>
            <h2 className="serif">Active deduction rules</h2>
          </div>
        </div>
        <div className="stack-list">
          {(inventory?.recipes ?? []).map((recipe: InventoryRecipeSummary) => (
            <article className="sub-panel" key={recipe.id}>
              <div className="section-header">
                <div>
                  <strong>{recipe.menuItemName}</strong>
                  <p className="supporting-copy">
                    {recipe.saleDeductionEnabled
                      ? 'Sale deduction enabled'
                      : 'Mapped but sale deduction is off'}
                  </p>
                </div>
              </div>
              <ul>
                {recipe.ingredients.map((ingredient) => (
                  <li key={`${recipe.id}-${ingredient.inventoryItemId}`}>
                    {ingredient.inventoryItemName}: {ingredient.quantity}{' '}
                    {ingredient.unit}
                  </li>
                ))}
              </ul>
            </article>
          ))}
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
