import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MenuStatus, MenuVersionStatus, type Prisma } from '@restaurant-pos/db';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { PrismaService } from '../database/prisma.service';
import { OperationsGateway } from '../realtime/operations.gateway';
import { TenantService } from '../tenant/tenant.service';
import type {
  CreateMenuSetupDto,
  MenuContentDto,
  ReplaceMenuDraftDto,
} from './dto/menu-setup.dto';

const menuDetailInclude = {
  versions: {
    orderBy: { versionNumber: 'desc' as const },
    include: {
      categories: {
        orderBy: { displayOrder: 'asc' as const },
        include: {
          items: {
            orderBy: { displayOrder: 'asc' as const },
            include: {
              variants: {
                orderBy: { displayOrder: 'asc' as const },
              },
              itemModifierGroups: {
                orderBy: { displayOrder: 'asc' as const },
                include: {
                  modifierGroup: {
                    include: {
                      options: {
                        orderBy: { displayOrder: 'asc' as const },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      modifierGroups: {
        orderBy: { displayOrder: 'asc' as const },
        include: {
          options: {
            orderBy: { displayOrder: 'asc' as const },
          },
        },
      },
    },
  },
} satisfies Prisma.MenuInclude;

@Injectable()
export class MenusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
    private readonly operations: OperationsGateway,
  ) {}

  async list(user: AuthenticatedUser, outletId: string) {
    await this.tenant.assertOutlet(user.companyId, outletId);
    return this.prisma.menu.findMany({
      where: {
        companyId: user.companyId,
        outletId,
        status: MenuStatus.ACTIVE,
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          select: {
            id: true,
            versionNumber: true,
            status: true,
            publishedAt: true,
            updatedAt: true,
          },
        },
      },
    });
  }

  async get(user: AuthenticatedUser, outletId: string, menuId: string) {
    await this.tenant.assertOutlet(user.companyId, outletId);
    const menu = await this.prisma.menu.findFirst({
      where: {
        id: menuId,
        companyId: user.companyId,
        outletId,
        status: MenuStatus.ACTIVE,
      },
      include: menuDetailInclude,
    });
    if (!menu) {
      throw new NotFoundException('Menu not found.');
    }
    return menu;
  }

  async setup(
    user: AuthenticatedUser,
    outletId: string,
    dto: CreateMenuSetupDto,
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.tenant.assertOutlet(user.companyId, outletId);
    this.validateContent(dto);

    const existing = await this.prisma.menu.findUnique({
      where: {
        outletId_slug: {
          outletId,
          slug: dto.slug,
        },
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Menu slug already exists for this outlet.');
    }

    const menuId = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault ?? true) {
        await tx.menu.updateMany({
          where: { companyId: user.companyId, outletId },
          data: { isDefault: false },
        });
      }

      const menu = await tx.menu.create({
        data: {
          companyId: user.companyId,
          outletId,
          name: dto.name,
          slug: dto.slug,
          channel: dto.channel,
          isDefault: dto.isDefault ?? true,
        },
      });
      const version = await tx.menuVersion.create({
        data: {
          companyId: user.companyId,
          menuId: menu.id,
          versionNumber: 1,
          status: dto.publish
            ? MenuVersionStatus.PUBLISHED
            : MenuVersionStatus.DRAFT,
          publishedAt: dto.publish ? new Date() : null,
          createdByUserId: user.userId,
        },
      });
      await this.createVersionContent(tx, user.companyId, version.id, dto);

      if (dto.publish) {
        await this.markMenuOnboardingComplete(tx, user.companyId);
      }
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          outletId,
          actorUserId: user.userId,
          actionType: dto.publish ? 'MENU_CREATED_PUBLISHED' : 'MENU_CREATED',
          entityType: 'menu',
          entityId: menu.id,
          afterJson: {
            name: menu.name,
            slug: menu.slug,
            versionNumber: version.versionNumber,
            published: Boolean(dto.publish),
          },
          reason: 'Initial menu configured through bulk setup.',
          requestId,
          ipAddress,
        },
      });
      return menu.id;
    });

    const menu = await this.get(user, outletId, menuId);
    this.operations.publishToOutlet(outletId, 'menu.updated', {
      menuId,
      action: dto.publish ? 'created_published' : 'created',
    });
    return menu;
  }

  async replaceDraft(
    user: AuthenticatedUser,
    outletId: string,
    menuId: string,
    dto: ReplaceMenuDraftDto,
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.tenant.assertOutlet(user.companyId, outletId);
    this.validateContent(dto);

    await this.prisma.$transaction(async (tx) => {
      const menu = await tx.menu.findFirst({
        where: {
          id: menuId,
          companyId: user.companyId,
          outletId,
          status: MenuStatus.ACTIVE,
        },
        include: {
          versions: {
            where: { status: MenuVersionStatus.DRAFT },
            take: 1,
          },
        },
      });
      if (!menu) {
        throw new NotFoundException('Menu not found.');
      }
      const draft = menu.versions[0];
      if (!draft) {
        throw new ConflictException(
          'No draft exists. Clone the published menu first.',
        );
      }

      if (dto.isDefault === true) {
        await tx.menu.updateMany({
          where: {
            companyId: user.companyId,
            outletId,
            id: { not: menuId },
          },
          data: { isDefault: false },
        });
      }
      await tx.menu.update({
        where: { id: menuId },
        data: {
          name: dto.name,
          channel: dto.channel,
          isDefault: dto.isDefault,
        },
      });
      await tx.menuCategory.deleteMany({
        where: { menuVersionId: draft.id },
      });
      await tx.modifierGroup.deleteMany({
        where: { menuVersionId: draft.id },
      });
      await this.createVersionContent(tx, user.companyId, draft.id, dto);
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          outletId,
          actorUserId: user.userId,
          actionType: 'MENU_DRAFT_REPLACED',
          entityType: 'menu_version',
          entityId: draft.id,
          reason: 'Draft menu content replaced through bulk setup.',
          requestId,
          ipAddress,
        },
      });
    });

    const menu = await this.get(user, outletId, menuId);
    this.operations.publishToOutlet(outletId, 'menu.updated', {
      menuId,
      action: 'draft_replaced',
    });
    return menu;
  }

  async cloneDraft(
    user: AuthenticatedUser,
    outletId: string,
    menuId: string,
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.tenant.assertOutlet(user.companyId, outletId);

    await this.prisma.$transaction(async (tx) => {
      const menu = await tx.menu.findFirst({
        where: {
          id: menuId,
          companyId: user.companyId,
          outletId,
          status: MenuStatus.ACTIVE,
        },
        include: {
          versions: {
            orderBy: { versionNumber: 'desc' },
            include: {
              categories: {
                orderBy: { displayOrder: 'asc' },
                include: {
                  items: {
                    orderBy: { displayOrder: 'asc' },
                    include: {
                      variants: { orderBy: { displayOrder: 'asc' } },
                      itemModifierGroups: {
                        orderBy: { displayOrder: 'asc' },
                        include: { modifierGroup: true },
                      },
                    },
                  },
                },
              },
              modifierGroups: {
                orderBy: { displayOrder: 'asc' },
                include: {
                  options: { orderBy: { displayOrder: 'asc' } },
                },
              },
            },
          },
        },
      });
      if (!menu) {
        throw new NotFoundException('Menu not found.');
      }
      if (
        menu.versions.some(
          (version) => version.status === MenuVersionStatus.DRAFT,
        )
      ) {
        throw new ConflictException('This menu already has a draft.');
      }
      const source = menu.versions.find(
        (version) => version.status === MenuVersionStatus.PUBLISHED,
      );
      if (!source) {
        throw new ConflictException('No published version exists to clone.');
      }
      const nextNumber =
        Math.max(...menu.versions.map(({ versionNumber }) => versionNumber)) +
        1;
      const draft = await tx.menuVersion.create({
        data: {
          companyId: user.companyId,
          menuId,
          versionNumber: nextNumber,
          status: MenuVersionStatus.DRAFT,
          createdByUserId: user.userId,
        },
      });
      await this.createVersionContent(
        tx,
        user.companyId,
        draft.id,
        this.versionToContent(source),
      );
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          outletId,
          actorUserId: user.userId,
          actionType: 'MENU_DRAFT_CLONED',
          entityType: 'menu_version',
          entityId: draft.id,
          afterJson: {
            sourceVersion: source.versionNumber,
            draftVersion: nextNumber,
          },
          reason: 'Published menu cloned into a new draft.',
          requestId,
          ipAddress,
        },
      });
    });

    const menu = await this.get(user, outletId, menuId);
    this.operations.publishToOutlet(outletId, 'menu.updated', {
      menuId,
      action: 'draft_cloned',
    });
    return menu;
  }

  async publish(
    user: AuthenticatedUser,
    outletId: string,
    menuId: string,
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.tenant.assertOutlet(user.companyId, outletId);

    await this.prisma.$transaction(async (tx) => {
      const menu = await tx.menu.findFirst({
        where: {
          id: menuId,
          companyId: user.companyId,
          outletId,
          status: MenuStatus.ACTIVE,
        },
        include: {
          versions: {
            orderBy: { versionNumber: 'desc' },
          },
        },
      });
      if (!menu) {
        throw new NotFoundException('Menu not found.');
      }
      const draft = menu.versions.find(
        (version) => version.status === MenuVersionStatus.DRAFT,
      );
      if (!draft) {
        throw new ConflictException('No draft version is available.');
      }
      const itemCount = await tx.menuItem.count({
        where: {
          menuVersionId: draft.id,
          active: true,
        },
      });
      if (itemCount === 0) {
        throw new ConflictException('Cannot publish an empty menu.');
      }

      await tx.menuVersion.updateMany({
        where: {
          menuId,
          status: MenuVersionStatus.PUBLISHED,
        },
        data: { status: MenuVersionStatus.ARCHIVED },
      });
      await tx.menuVersion.update({
        where: { id: draft.id },
        data: {
          status: MenuVersionStatus.PUBLISHED,
          publishedAt: new Date(),
        },
      });
      await this.markMenuOnboardingComplete(tx, user.companyId);
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          outletId,
          actorUserId: user.userId,
          actionType: 'MENU_PUBLISHED',
          entityType: 'menu_version',
          entityId: draft.id,
          afterJson: { versionNumber: draft.versionNumber },
          reason: 'Menu draft published.',
          requestId,
          ipAddress,
        },
      });
    });

    const menu = await this.get(user, outletId, menuId);
    this.operations.publishToOutlet(outletId, 'menu.updated', {
      menuId,
      action: 'published',
    });
    return menu;
  }

  async setSoldOut(
    user: AuthenticatedUser,
    outletId: string,
    itemId: string,
    soldOut: boolean,
    reason: string,
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.tenant.assertOutlet(user.companyId, outletId);

    const item = await this.prisma.menuItem.findFirst({
      where: {
        id: itemId,
        companyId: user.companyId,
        menuVersion: {
          menu: {
            outletId,
            status: MenuStatus.ACTIVE,
          },
        },
      },
      include: {
        menuVersion: { select: { status: true } },
      },
    });
    if (!item) {
      throw new NotFoundException('Menu item not found.');
    }
    if (item.menuVersion.status === MenuVersionStatus.ARCHIVED) {
      throw new ConflictException('Archived menu items cannot be changed.');
    }

    await this.prisma.$transaction([
      this.prisma.menuItem.update({
        where: { id: item.id },
        data: { soldOut },
      }),
      this.prisma.auditLog.create({
        data: {
          companyId: user.companyId,
          outletId,
          actorUserId: user.userId,
          actionType: soldOut ? 'MENU_ITEM_SOLD_OUT' : 'MENU_ITEM_AVAILABLE',
          entityType: 'menu_item',
          entityId: item.id,
          beforeJson: { soldOut: item.soldOut },
          afterJson: { soldOut },
          reason,
          requestId,
          ipAddress,
        },
      }),
    ]);

    this.operations.publishToOutlet(outletId, 'menu.updated', {
      itemId: item.id,
      action: soldOut ? 'item_sold_out' : 'item_available',
    });
    return { id: item.id, soldOut };
  }

  private validateContent(dto: MenuContentDto): void {
    const groups = dto.modifierGroups ?? [];
    const keys = groups.map(({ key }) => key);
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException('Modifier group keys must be unique.');
    }
    for (const group of groups) {
      if (group.minSelect > group.maxSelect) {
        throw new BadRequestException(
          `Modifier group ${group.key} has minSelect greater than maxSelect.`,
        );
      }
      if (group.required && group.minSelect < 1) {
        throw new BadRequestException(
          `Required modifier group ${group.key} must select at least one option.`,
        );
      }
      if (group.maxSelect > group.options.length) {
        throw new BadRequestException(
          `Modifier group ${group.key} cannot select more options than it contains.`,
        );
      }
    }

    const categoryNames = dto.categories.map(({ name }) => name.toLowerCase());
    if (new Set(categoryNames).size !== categoryNames.length) {
      throw new BadRequestException('Category names must be unique.');
    }

    const knownKeys = new Set(keys);
    const skus: string[] = [];
    for (const category of dto.categories) {
      for (const item of category.items) {
        if (item.sku) {
          skus.push(item.sku.toLowerCase());
        }
        for (const key of item.modifierGroupKeys ?? []) {
          if (!knownKeys.has(key)) {
            throw new BadRequestException(
              `Menu item ${item.name} references unknown modifier group ${key}.`,
            );
          }
        }
      }
    }
    if (new Set(skus).size !== skus.length) {
      throw new BadRequestException('Item SKUs must be unique in a menu.');
    }
  }

  private async createVersionContent(
    tx: Prisma.TransactionClient,
    companyId: string,
    menuVersionId: string,
    dto: MenuContentDto,
  ): Promise<void> {
    const groupIds = new Map<string, string>();
    for (const group of dto.modifierGroups ?? []) {
      const created = await tx.modifierGroup.create({
        data: {
          companyId,
          menuVersionId,
          key: group.key,
          name: group.name,
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
          required: group.required,
          displayOrder: group.displayOrder,
          options: {
            create: group.options.map((option) => ({
              companyId,
              name: option.name,
              priceDeltaCents: option.priceDeltaCents,
              displayOrder: option.displayOrder,
            })),
          },
        },
      });
      groupIds.set(group.key, created.id);
    }

    for (const category of dto.categories) {
      const createdCategory = await tx.menuCategory.create({
        data: {
          companyId,
          menuVersionId,
          name: category.name,
          displayOrder: category.displayOrder,
          active: category.active,
        },
      });
      for (const item of category.items) {
        const createdItem = await tx.menuItem.create({
          data: {
            companyId,
            menuVersionId,
            categoryId: createdCategory.id,
            sku: item.sku,
            name: item.name,
            description: item.description,
            imageUrl: item.imageUrl,
            basePriceCents: item.basePriceCents,
            costPriceCents: item.costPriceCents,
            taxable: item.taxable,
            serviceChargeable: item.serviceChargeable,
            preparationStationKey: item.preparationStationKey,
            active: item.active,
            soldOut: item.soldOut,
            displayOrder: item.displayOrder,
            variants: {
              create: (item.variants ?? []).map((variant) => ({
                companyId,
                name: variant.name,
                priceDeltaCents: variant.priceDeltaCents,
                displayOrder: variant.displayOrder,
              })),
            },
          },
        });
        const references = item.modifierGroupKeys ?? [];
        if (references.length > 0) {
          await tx.menuItemModifierGroup.createMany({
            data: references.map((key, index) => {
              const modifierGroupId = groupIds.get(key);
              if (!modifierGroupId) {
                throw new BadRequestException(`Unknown modifier group ${key}.`);
              }
              return {
                menuItemId: createdItem.id,
                modifierGroupId,
                displayOrder: index,
              };
            }),
          });
        }
      }
    }
  }

  private versionToContent(
    version: Prisma.MenuVersionGetPayload<{
      include: {
        categories: {
          include: {
            items: {
              include: {
                variants: true;
                itemModifierGroups: { include: { modifierGroup: true } };
              };
            };
          };
        };
        modifierGroups: { include: { options: true } };
      };
    }>,
  ): MenuContentDto {
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
          imageUrl: item.imageUrl ?? undefined,
          basePriceCents: item.basePriceCents,
          costPriceCents: item.costPriceCents ?? undefined,
          taxable: item.taxable,
          serviceChargeable: item.serviceChargeable,
          preparationStationKey: item.preparationStationKey,
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

  private async markMenuOnboardingComplete(
    tx: Prisma.TransactionClient,
    companyId: string,
  ): Promise<void> {
    await tx.clientOnboarding.updateMany({
      where: {
        companyId,
        menuPublishedAt: null,
      },
      data: { menuPublishedAt: new Date() },
    });
  }
}
