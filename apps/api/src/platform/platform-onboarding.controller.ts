import {
  Body,
  Controller,
  Get,
  Headers,
  Ip,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { CreateClientOnboardingDto } from './dto/create-client-onboarding.dto';
import { PlatformKeyGuard } from './guards/platform-key.guard';
import { PlatformOnboardingService } from './platform-onboarding.service';

@ApiTags('Platform onboarding')
@ApiHeader({ name: 'x-platform-key', required: true })
@Public()
@UseGuards(PlatformKeyGuard)
@Controller('platform/onboarding/clients')
export class PlatformOnboardingController {
  constructor(private readonly onboarding: PlatformOnboardingService) {}

  @Post()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  createClient(
    @Body() dto: CreateClientOnboardingDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-platform-operator') operator = 'platform-admin',
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.onboarding.createClient(
      dto,
      idempotencyKey ?? '',
      operator,
      request.id,
      ipAddress,
    );
  }

  @Get()
  listClients() {
    return this.onboarding.listClients();
  }

  @Get(':companyId')
  getClient(@Param('companyId') companyId: string) {
    return this.onboarding.getClient(companyId);
  }

  @Post(':companyId/reissue-activation')
  reissueActivation(
    @Param('companyId') companyId: string,
    @Headers('x-platform-operator') operator = 'platform-admin',
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.onboarding.reissueActivation(
      companyId,
      operator,
      request.id,
      ipAddress,
    );
  }
}
