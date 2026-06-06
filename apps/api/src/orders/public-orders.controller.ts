import {
  Body,
  Controller,
  Get,
  Headers,
  Ip,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { CreatePublicOrderDto } from './dto/create-public-order.dto';
import { OrdersService } from './orders.service';

@ApiTags('Public orders')
@Public()
@Controller('public/qr/:publicCode/:token/orders')
export class PublicOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  create(
    @Param('publicCode') publicCode: string,
    @Param('token') token: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreatePublicOrderDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.orders.createPublicOrder(
      publicCode,
      token,
      idempotencyKey ?? '',
      dto,
      request.id,
      ipAddress,
    );
  }

  @Get(':orderId')
  get(
    @Param('publicCode') publicCode: string,
    @Param('token') token: string,
    @Param('orderId') orderId: string,
  ) {
    return this.orders.getPublicOrder(publicCode, token, orderId);
  }
}
