import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
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
}
