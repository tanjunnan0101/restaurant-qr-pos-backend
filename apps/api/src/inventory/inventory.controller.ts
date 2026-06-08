import { Body, Controller, Get, Ip, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { InventoryService } from './inventory.service';
import type {
  CreateInventoryItemDto,
  RecordInventoryMovementDto,
  StockCountDto,
  UpdateInventoryItemDto,
  UpsertRecipeDto,
} from './dto/inventory.dto';

@ApiTags('Inventory')
@ApiBearerAuth()
@Controller('admin/outlets/:outletId/inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @Permissions('menu.read')
  listItems(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
  ) {
    return this.inventory.listItems(user, outletId);
  }

  @Post('items')
  @Permissions('menu.manage')
  createItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Body() dto: CreateInventoryItemDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.inventory.createItem(user, outletId, dto, request.id, ipAddress);
  }

  @Patch('items/:itemId')
  @Permissions('menu.manage')
  updateItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateInventoryItemDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.inventory.updateItem(
      user,
      outletId,
      itemId,
      dto,
      request.id,
      ipAddress,
    );
  }

  @Get('movements')
  @Permissions('menu.read')
  listMovements(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Query('limit') limit?: string,
  ) {
    return this.inventory.listMovements(
      user,
      outletId,
      limit ? Number(limit) : undefined,
    );
  }

  @Post('movements/stock-in')
  @Permissions('menu.manage')
  stockIn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Body() dto: RecordInventoryMovementDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.inventory.stockIn(user, outletId, dto, request.id, ipAddress);
  }

  @Post('movements/wastage')
  @Permissions('menu.manage')
  wastage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Body() dto: RecordInventoryMovementDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.inventory.wastage(user, outletId, dto, request.id, ipAddress);
  }

  @Post('movements/adjustment')
  @Permissions('menu.manage')
  adjustment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Body() dto: RecordInventoryMovementDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.inventory.adjustment(
      user,
      outletId,
      dto,
      request.id,
      ipAddress,
    );
  }

  @Post('movements/stock-count')
  @Permissions('menu.manage')
  stockCount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Body() dto: StockCountDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.inventory.stockCount(
      user,
      outletId,
      dto,
      request.id,
      ipAddress,
    );
  }

  @Post('recipes/:menuItemId')
  @Permissions('menu.manage')
  upsertRecipe(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Param('menuItemId') menuItemId: string,
    @Body() dto: UpsertRecipeDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.inventory.upsertRecipe(
      user,
      outletId,
      menuItemId,
      dto,
      request.id,
      ipAddress,
    );
  }
}
