import { Module } from '@nestjs/common';
import { PlatformKeyGuard } from './guards/platform-key.guard';
import { PlatformOnboardingController } from './platform-onboarding.controller';
import { PlatformOnboardingService } from './platform-onboarding.service';

@Module({
  controllers: [PlatformOnboardingController],
  providers: [PlatformOnboardingService, PlatformKeyGuard],
})
export class PlatformModule {}
