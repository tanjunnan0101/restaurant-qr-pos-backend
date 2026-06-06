import {
  Body,
  Controller,
  Get,
  Ip,
  Param,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  CreateMenuSetupDto,
  ReplaceMenuDraftDto,
  SetSoldOutDto,
} from './dto/menu-setup.dto';
import { MenusService } from './menus.service';

@ApiTags('Menus')
@ApiBearerAuth()
@Controller('admin/outlets/:outletId/menus')
export class MenusController {
  constructor(private readonly menus: MenusService) {}

  @Get()
  @Permissions('menu.read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
  ) {
    return this.menus.list(user, outletId);
  }

  @Get(':menuId')
  @Permissions('menu.read')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Param('menuId') menuId: string,
  ) {
    return this.menus.get(user, outletId, menuId);
  }

  @Post('setup')
  @Permissions('menu.manage')
  setup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Body() dto: CreateMenuSetupDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.menus.setup(user, outletId, dto, request.id, ipAddress);
  }

  @Post(':menuId/draft/clone')
  @Permissions('menu.manage')
  cloneDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Param('menuId') menuId: string,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.menus.cloneDraft(user, outletId, menuId, request.id, ipAddress);
  }

  @Put(':menuId/draft')
  @Permissions('menu.manage')
  replaceDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Param('menuId') menuId: string,
    @Body() dto: ReplaceMenuDraftDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.menus.replaceDraft(
      user,
      outletId,
      menuId,
      dto,
      request.id,
      ipAddress,
    );
  }

  @Post(':menuId/publish')
  @Permissions('menu.publish')
  publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Param('menuId') menuId: string,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.menus.publish(user, outletId, menuId, request.id, ipAddress);
  }

  @Patch('items/:itemId/sold-out')
  @Permissions('menu.manage')
  setSoldOut(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Param('itemId') itemId: string,
    @Body() dto: SetSoldOutDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.menus.setSoldOut(
      user,
      outletId,
      itemId,
      dto.soldOut,
      dto.reason,
      request.id,
      ipAddress,
    );
  }
}
