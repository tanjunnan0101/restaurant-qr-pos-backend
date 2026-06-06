import { Body, Controller, Get, Ip, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { PrintReasonDto, SetupPrintersDto } from './dto/printer-setup.dto';
import { PrintingService } from './printing.service';

@ApiTags('Printing')
@ApiBearerAuth()
@Controller('admin/outlets/:outletId/printing')
export class PrintingController {
  constructor(private readonly printing: PrintingService) {}

  @Get()
  @Permissions('printer.manage')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
  ) {
    return this.printing.list(user, outletId);
  }

  @Post('setup')
  @Permissions('printer.manage')
  setup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Body() dto: SetupPrintersDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.printing.setup(user, outletId, dto, request.id, ipAddress);
  }

  @Post('printers/:printerId/test')
  @Permissions('printer.manage')
  test(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Param('printerId') printerId: string,
    @Body() dto: PrintReasonDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.printing.createTestPrint(
      user,
      outletId,
      printerId,
      dto.reason,
      request.id,
      ipAddress,
    );
  }

  @Post('jobs/:printJobId/retry')
  @Permissions('printer.manage')
  retry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Param('printJobId') printJobId: string,
    @Body() dto: PrintReasonDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.printing.retry(
      user,
      outletId,
      printJobId,
      dto.reason,
      request.id,
      ipAddress,
    );
  }

  @Post('jobs/:printJobId/reprint')
  @Permissions('printer.manage')
  reprint(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Param('printJobId') printJobId: string,
    @Body() dto: PrintReasonDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.printing.reprint(
      user,
      outletId,
      printJobId,
      dto.reason,
      request.id,
      ipAddress,
    );
  }
}
