import {
  Body,
  Controller,
  Get,
  Headers,
  Ip,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { OrderStatus } from '@restaurant-pos/db';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateAdminOrderDto } from './dto/create-admin-order.dto';
import {
  CancelOrderDto,
  PrintPrePaymentBillDto,
  UpdateOrderStatusDto,
  VerifyManualPayNowDto,
} from './dto/order-actions.dto';
import { UpdateAdminOrderDto } from './dto/update-admin-order.dto';
import { OrdersService } from './orders.service';

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('admin/outlets/:outletId/orders')
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Permissions('order.manage')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateAdminOrderDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.orders.createAdminOrder(
      user,
      outletId,
      idempotencyKey ?? '',
      dto,
      request.id,
      ipAddress,
    );
  }

  @Get()
  @Permissions('order.read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Query('status') status?: OrderStatus,
    @Query('tableId') tableId?: string,
  ) {
    return this.orders.listAdmin(user, outletId, status, tableId);
  }

  @Get(':orderId')
  @Permissions('order.read')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Param('orderId') orderId: string,
  ) {
    return this.orders.getAdmin(user, outletId, orderId);
  }

  @Post(':orderId/cancel')
  @Permissions('order.manage')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Param('orderId') orderId: string,
    @Body() dto: CancelOrderDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.orders.cancelAdminOrder(
      user,
      outletId,
      orderId,
      dto.reason,
      request.id,
      ipAddress,
    );
  }

  @Post(':orderId/amend')
  @Permissions('order.manage')
  amend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Param('orderId') orderId: string,
    @Body() dto: UpdateAdminOrderDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.orders.amendAdminOrder(
      user,
      outletId,
      orderId,
      dto,
      request.id,
      ipAddress,
    );
  }

  @Post(':orderId/manual-paynow/verify')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Permissions('order.manage')
  verifyManualPayNow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Param('orderId') orderId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: VerifyManualPayNowDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.orders.verifyManualPayNow(
      user,
      outletId,
      orderId,
      idempotencyKey ?? '',
      dto,
      request.id,
      ipAddress,
    );
  }

  @Post(':orderId/print-bill')
  @Permissions('order.manage')
  printPrePaymentBill(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Param('orderId') orderId: string,
    @Body() dto: PrintPrePaymentBillDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.orders.printPrePaymentBill(
      user,
      outletId,
      orderId,
      dto.reason,
      request.id,
      ipAddress,
    );
  }

  @Post(':orderId/status')
  @Permissions('order.manage')
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Param('orderId') orderId: string,
    @Body() dto: UpdateOrderStatusDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.orders.updateStatus(
      user,
      outletId,
      orderId,
      dto.status,
      dto.reason,
      request.id,
      ipAddress,
    );
  }
}
