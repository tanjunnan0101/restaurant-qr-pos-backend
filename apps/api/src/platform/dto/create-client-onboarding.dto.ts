import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class OnboardingPaymentDefaultsDto {
  @IsOptional()
  @IsBoolean()
  onlinePaymentsEnabled?: boolean = true;

  @IsOptional()
  @IsBoolean()
  stripeCardEnabled?: boolean = true;

  @IsOptional()
  @IsBoolean()
  stripePayNowEnabled?: boolean = true;

  @IsOptional()
  @IsBoolean()
  manualPayNowEnabled?: boolean = false;
}

export class CreateClientOnboardingDto {
  @IsString()
  @Length(2, 160)
  companyName!: string;

  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  companySlug!: string;

  @IsOptional()
  @IsString()
  @Length(2, 200)
  legalName?: string;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  registrationNumber?: string;

  @IsString()
  @Length(2, 160)
  ownerFullName!: string;

  @IsEmail()
  ownerEmail!: string;

  @IsString()
  @Length(2, 160)
  outletName!: string;

  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  outletSlug!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @Length(5, 40)
  phone?: string;

  @IsOptional()
  @IsString()
  timezone?: string = 'Asia/Singapore';

  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currency?: string = 'SGD';

  @IsOptional()
  @IsBoolean()
  gstEnabled?: boolean = true;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  gstRateBps?: number = 900;

  @IsOptional()
  @IsBoolean()
  serviceChargeEnabled?: boolean = false;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  serviceChargeBps?: number = 1000;

  @IsOptional()
  @ValidateNested()
  @Type(() => OnboardingPaymentDefaultsDto)
  payments?: OnboardingPaymentDefaultsDto;
}
