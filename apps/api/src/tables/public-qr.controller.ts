import { Body, Controller, Get, Ip, Param, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { CreateServiceRequestDto } from './dto/service-request.dto';
import { PublicQrService } from './public-qr.service';

@ApiTags('Public QR')
@Public()
@Controller('public/qr')
export class PublicQrController {
  constructor(private readonly qr: PublicQrService) {}

  @Get(':publicCode/:token')
  resolve(
    @Param('publicCode') publicCode: string,
    @Param('token') token: string,
  ) {
    return this.qr.resolve(publicCode, token);
  }

  @Post(':publicCode/:token/service-requests/help')
  requestHelp(
    @Param('publicCode') publicCode: string,
    @Param('token') token: string,
    @Body() dto: CreateServiceRequestDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.qr.requestHelp(
      publicCode,
      token,
      dto.note,
      request.id,
      ipAddress,
    );
  }
}
