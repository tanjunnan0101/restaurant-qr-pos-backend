import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StockMovementType, type Prisma } from '@restaurant-pos/db';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import type {
  CreateInventoryItemDto,
  RecordInventoryMovementDto,
  StockCountDto,
  UpdateInventoryItemDto,
  UpsertRecipeDto,
} from './dto/inventory.dto';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
  ) {}

  async listItems(user: AuthenticatedUser, outletId: string) {
    await this.tenant.assertOutlet(user.companyId, outletId);

    const items = await inventoryItems(this.prisma).findMany({
      where: {
        companyId: user.companyId,
        outletId,
      },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });

    const [balances, recipes] = await Promise.all([
      stockMovements(this.prisma).groupBy({
        by: ['inventoryItemId'],
        where: {
          companyId: user.companyId,
          outletId,
        },
        _sum: {
          quantityDelta: true,
        },
      }),
      recipesDelegate(this.prisma).findMany({
        where: {
          companyId: user.companyId,
          outletId,
        },
        include: {
          menuItem: {
            select: {
              id: true,
              name: true,
              sku: true,
            },
          },
          ingredients: {
            include: {
              inventoryItem: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  baseUnit: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const balanceByItemId = new Map(
      (balances as any[]).map((row) => [
        row.inventoryItemId,
        toNumber(row._sum.quantityDelta),
      ]),
    );
    const recipeByMenuItemId = new Map(
      (recipes as any[]).map((recipe) => [recipe.menuItemId, recipe]),
    );

    return {
      items: (items as any[]).map((item) => ({
        id: item.id,
        sku: item.sku,
        name: item.name,
        category: item.category,
        baseUnit: item.baseUnit,
        purchaseUnit: item.purchaseUnit,
        conversionRate: toNumber(item.conversionRate),
        reorderPoint: toNumber(item.reorderPoint),
        lowStockAlertEnabled: item.lowStockAlertEnabled,
        active: item.active,
        stockOnHand: balanceByItemId.get(item.id) ?? 0,
        lowStock:
          item.lowStockAlertEnabled &&
          (balanceByItemId.get(item.id) ?? 0) <= toNumber(item.reorderPoint),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
      recipes: (recipes as any[]).map((recipe) => ({
        id: recipe.id,
        menuItemId: recipe.menuItemId,
        menuItemName: recipe.menuItem.name,
        menuItemSku: recipe.menuItem.sku,
        active: recipe.active,
        saleDeductionEnabled: recipe.saleDeductionEnabled,
        ingredients: recipe.ingredients.map((ingredient: any) => ({
          inventoryItemId: ingredient.inventoryItemId,
          inventoryItemName: ingredient.inventoryItem.name,
          inventoryItemSku: ingredient.inventoryItem.sku,
          quantity: toNumber(ingredient.quantity),
          unit: ingredient.unit,
        })),
      })),
      recipeMenuItemIds: Array.from(recipeByMenuItemId.keys()),
    };
  }

  async createItem(
    user: AuthenticatedUser,
    outletId: string,
    dto: CreateInventoryItemDto,
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.tenant.assertOutlet(user.companyId, outletId);

    const existingSku =
      dto.sku?.trim()
        ? await inventoryItems(this.prisma).findFirst({
            where: {
              companyId: user.companyId,
              outletId,
              sku: dto.sku.trim(),
            },
            select: { id: true },
          })
        : null;
    if (existingSku) {
      throw new ConflictException('Inventory SKU already exists for this outlet.');
    }

    const created = await inventoryItems(this.prisma).create({
      data: {
        companyId: user.companyId,
        outletId,
        sku: normalizeText(dto.sku),
        name: dto.name.trim(),
        category: normalizeText(dto.category),
        baseUnit: dto.baseUnit.trim(),
        purchaseUnit: normalizeText(dto.purchaseUnit),
        conversionRate: dto.conversionRate ?? 1,
        reorderPoint: dto.reorderPoint ?? 0,
        lowStockAlertEnabled: dto.lowStockAlertEnabled ?? true,
        active: dto.active ?? true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        companyId: user.companyId,
        outletId,
        actorUserId: user.userId,
        actionType: 'INVENTORY_ITEM_CREATED',
        entityType: 'inventory_item',
        entityId: created.id,
        afterJson: created as unknown as Prisma.InputJsonValue,
        reason: 'Created inventory item.',
        requestId,
        ipAddress,
      },
    });

    return created;
  }

  async updateItem(
    user: AuthenticatedUser,
    outletId: string,
    itemId: string,
    dto: UpdateInventoryItemDto,
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.tenant.assertOutlet(user.companyId, outletId);

    const existing = await inventoryItems(this.prisma).findFirst({
      where: {
        id: itemId,
        companyId: user.companyId,
        outletId,
      },
    });
    if (!existing) {
      throw new NotFoundException('Inventory item not found.');
    }

    if (dto.sku?.trim() && dto.sku.trim() !== existing.sku) {
      const skuConflict = await inventoryItems(this.prisma).findFirst({
        where: {
          companyId: user.companyId,
          outletId,
          sku: dto.sku.trim(),
          id: { not: itemId },
        },
        select: { id: true },
      });
      if (skuConflict) {
        throw new ConflictException(
          'Inventory SKU already exists for this outlet.',
        );
      }
    }

    const updated = await inventoryItems(this.prisma).update({
      where: { id: itemId },
      data: {
        sku: dto.sku === undefined ? undefined : normalizeText(dto.sku),
        name: dto.name?.trim() ?? undefined,
        category: dto.category === undefined ? undefined : normalizeText(dto.category),
        baseUnit: dto.baseUnit?.trim() ?? undefined,
        purchaseUnit:
          dto.purchaseUnit === undefined
            ? undefined
            : normalizeText(dto.purchaseUnit),
        conversionRate: dto.conversionRate ?? undefined,
        reorderPoint: dto.reorderPoint ?? undefined,
        lowStockAlertEnabled: dto.lowStockAlertEnabled ?? undefined,
        active: dto.active ?? undefined,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        companyId: user.companyId,
        outletId,
        actorUserId: user.userId,
        actionType: 'INVENTORY_ITEM_UPDATED',
        entityType: 'inventory_item',
        entityId: itemId,
        beforeJson: existing as unknown as Prisma.InputJsonValue,
        afterJson: updated as unknown as Prisma.InputJsonValue,
        reason: dto.reason,
        requestId,
        ipAddress,
      },
    });

    return updated;
  }

  async listMovements(user: AuthenticatedUser, outletId: string, limit = 100) {
    await this.tenant.assertOutlet(user.companyId, outletId);

    const movements = await stockMovements(this.prisma).findMany({
      where: {
        companyId: user.companyId,
        outletId,
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
      include: {
        inventoryItem: {
          select: {
            id: true,
            name: true,
            sku: true,
            baseUnit: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    return {
      movements: (movements as any[]).map((movement) => ({
        id: movement.id,
        movementType: movement.movementType,
        quantityDelta: toNumber(movement.quantityDelta),
        unit: movement.unit,
        referenceType: movement.referenceType,
        referenceId: movement.referenceId,
        reason: movement.reason,
        createdAt: movement.createdAt,
        inventoryItem: movement.inventoryItem,
        createdBy: movement.createdBy,
      })),
    };
  }

  async stockIn(
    user: AuthenticatedUser,
    outletId: string,
    dto: RecordInventoryMovementDto,
    requestId?: string,
    ipAddress?: string,
  ) {
    return this.createMovement(
      user,
      outletId,
      dto,
      StockMovementType.PURCHASE,
      dto.quantity,
      dto.reason ?? 'Stock in recorded.',
      requestId,
      ipAddress,
    );
  }

  async wastage(
    user: AuthenticatedUser,
    outletId: string,
    dto: RecordInventoryMovementDto,
    requestId?: string,
    ipAddress?: string,
  ) {
    return this.createMovement(
      user,
      outletId,
      dto,
      StockMovementType.WASTAGE,
      -Math.abs(dto.quantity),
      dto.reason ?? 'Wastage recorded.',
      requestId,
      ipAddress,
    );
  }

  async adjustment(
    user: AuthenticatedUser,
    outletId: string,
    dto: RecordInventoryMovementDto,
    requestId?: string,
    ipAddress?: string,
  ) {
    const signedQuantity = dto.quantity;
    return this.createMovement(
      user,
      outletId,
      dto,
      StockMovementType.ADJUSTMENT,
      signedQuantity,
      dto.reason ?? 'Manual inventory adjustment.',
      requestId,
      ipAddress,
    );
  }

  async stockCount(
    user: AuthenticatedUser,
    outletId: string,
    dto: StockCountDto,
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.tenant.assertOutlet(user.companyId, outletId);
    const item = await inventoryItems(this.prisma).findFirst({
      where: {
        id: dto.inventoryItemId,
        companyId: user.companyId,
        outletId,
      },
    });
    if (!item) {
      throw new NotFoundException('Inventory item not found.');
    }

    const currentBalance = await this.stockBalance(
      user.companyId,
      outletId,
      item.id,
    );
    const delta = dto.actualQuantity - currentBalance;

    const movement = await stockMovements(this.prisma).create({
      data: {
        companyId: user.companyId,
        outletId,
        inventoryItemId: item.id,
        movementType: StockMovementType.STOCK_COUNT,
        quantityDelta: delta,
        unit: item.baseUnit,
        reason: dto.reason,
        createdByUserId: user.userId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        companyId: user.companyId,
        outletId,
        actorUserId: user.userId,
        actionType: 'INVENTORY_STOCK_COUNT_RECORDED',
        entityType: 'stock_movement',
        entityId: movement.id,
        beforeJson: {
          stockOnHand: currentBalance,
        } as Prisma.InputJsonValue,
        afterJson: {
          stockOnHand: dto.actualQuantity,
          delta,
          inventoryItemId: item.id,
        } as Prisma.InputJsonValue,
        reason: dto.reason,
        requestId,
        ipAddress,
      },
    });

    return movement;
  }

  async upsertRecipe(
    user: AuthenticatedUser,
    outletId: string,
    menuItemId: string,
    dto: UpsertRecipeDto,
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.tenant.assertOutlet(user.companyId, outletId);

    const menuItem = await this.prisma.menuItem.findFirst({
      where: {
        id: menuItemId,
        companyId: user.companyId,
        menuVersion: {
          menu: {
            outletId,
          },
        },
      },
      select: {
        id: true,
        name: true,
      },
    });
    if (!menuItem) {
      throw new NotFoundException('Menu item not found for this outlet.');
    }

    const inventoryIds = dto.ingredients.map((ingredient) => ingredient.inventoryItemId);
    const foundItems = await inventoryItems(this.prisma).findMany({
      where: {
        companyId: user.companyId,
        outletId,
        id: { in: inventoryIds },
      },
      select: {
        id: true,
      },
    });
    if (foundItems.length !== new Set(inventoryIds).size) {
      throw new BadRequestException(
        'One or more recipe ingredients do not belong to this outlet inventory.',
      );
    }

    const existing = await recipesDelegate(this.prisma).findFirst({
      where: {
        companyId: user.companyId,
        outletId,
        menuItemId,
      },
      include: {
        ingredients: true,
      },
    });

    const recipe = await this.prisma.$transaction(async (tx) => {
      const saved = await recipesDelegate(tx).upsert({
        where: { menuItemId },
        update: {
          active: dto.active ?? undefined,
          saleDeductionEnabled: dto.saleDeductionEnabled ?? undefined,
        },
        create: {
          companyId: user.companyId,
          outletId,
          menuItemId,
          active: dto.active ?? true,
          saleDeductionEnabled: dto.saleDeductionEnabled ?? false,
        },
      });

      await recipeIngredients(tx).deleteMany({
        where: { recipeId: saved.id },
      });
      if (dto.ingredients.length > 0) {
        await recipeIngredients(tx).createMany({
          data: dto.ingredients.map((ingredient) => ({
            recipeId: saved.id,
            companyId: user.companyId,
            inventoryItemId: ingredient.inventoryItemId,
            quantity: ingredient.quantity,
            unit: ingredient.unit.trim(),
          })),
        });
      }

      const refreshed = await recipesDelegate(tx).findUniqueOrThrow({
        where: { id: saved.id },
        include: {
          ingredients: true,
        },
      });

      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          outletId,
          actorUserId: user.userId,
          actionType: existing
            ? 'INVENTORY_RECIPE_UPDATED'
            : 'INVENTORY_RECIPE_CREATED',
          entityType: 'recipe',
          entityId: refreshed.id,
          beforeJson: existing as unknown as Prisma.InputJsonValue,
          afterJson: refreshed as unknown as Prisma.InputJsonValue,
          reason: dto.reason,
          requestId,
          ipAddress,
        },
      });

      return refreshed;
    });

    return recipe;
  }

  private async createMovement(
    user: AuthenticatedUser,
    outletId: string,
    dto: RecordInventoryMovementDto,
    movementType: StockMovementType,
    quantityDelta: number,
    reason: string,
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.tenant.assertOutlet(user.companyId, outletId);
    const item = await inventoryItems(this.prisma).findFirst({
      where: {
        id: dto.inventoryItemId,
        companyId: user.companyId,
        outletId,
      },
    });
    if (!item) {
      throw new NotFoundException('Inventory item not found.');
    }

    const movement = await stockMovements(this.prisma).create({
      data: {
        companyId: user.companyId,
        outletId,
        inventoryItemId: item.id,
        movementType,
        quantityDelta,
        unit: item.baseUnit,
        reason,
        createdByUserId: user.userId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        companyId: user.companyId,
        outletId,
        actorUserId: user.userId,
        actionType: 'INVENTORY_MOVEMENT_RECORDED',
        entityType: 'stock_movement',
        entityId: movement.id,
        afterJson: {
          inventoryItemId: item.id,
          movementType,
          quantityDelta,
          unit: item.baseUnit,
        } as Prisma.InputJsonValue,
        reason,
        requestId,
        ipAddress,
      },
    });

    return movement;
  }

  private async stockBalance(
    companyId: string,
    outletId: string,
    inventoryItemId: string,
  ) {
    const result = await stockMovements(this.prisma).aggregate({
      where: {
        companyId,
        outletId,
        inventoryItemId,
      },
      _sum: {
        quantityDelta: true,
      },
    });

    return toNumber((result as any)._sum.quantityDelta);
  }
}

function inventoryItems(client: unknown) {
  return (client as { inventoryItem: any }).inventoryItem;
}

function recipesDelegate(client: unknown) {
  return (client as { recipe: any }).recipe;
}

function recipeIngredients(client: unknown) {
  return (client as { recipeIngredient: any }).recipeIngredient;
}

function stockMovements(client: unknown) {
  return (client as { stockMovement: any }).stockMovement;
}

function normalizeText(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    return Number(value);
  }
  if (value && typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return 0;
}
