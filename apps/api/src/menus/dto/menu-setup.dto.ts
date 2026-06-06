import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { MenuChannel } from '@restaurant-pos/db';

export class MenuVariantDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsInt()
  priceDeltaCents!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number = 0;
}

export class MenuModifierOptionDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsInt()
  priceDeltaCents!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number = 0;
}

export class MenuModifierGroupDto {
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  key!: string;

  @IsString()
  @Length(1, 120)
  name!: string;

  @IsInt()
  @Min(0)
  minSelect!: number;

  @IsInt()
  @Min(1)
  @Max(50)
  maxSelect!: number;

  @IsBoolean()
  required!: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number = 0;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MenuModifierOptionDto)
  options!: MenuModifierOptionDto[];
}

export class MenuItemDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  sku?: string;

  @IsString()
  @Length(1, 160)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  imageUrl?: string;

  @IsInt()
  @Min(0)
  basePriceCents!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  costPriceCents?: number;

  @IsOptional()
  @IsBoolean()
  taxable?: boolean = true;

  @IsOptional()
  @IsBoolean()
  serviceChargeable?: boolean = true;

  @IsOptional()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  preparationStationKey?: string = 'main-kitchen';

  @IsOptional()
  @IsBoolean()
  active?: boolean = true;

  @IsOptional()
  @IsBoolean()
  soldOut?: boolean = false;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number = 0;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuVariantDto)
  variants?: MenuVariantDto[] = [];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  modifierGroupKeys?: string[] = [];
}

export class MenuCategoryDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number = 0;

  @IsOptional()
  @IsBoolean()
  active?: boolean = true;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MenuItemDto)
  items!: MenuItemDto[];
}

export class MenuContentDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuModifierGroupDto)
  modifierGroups?: MenuModifierGroupDto[] = [];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MenuCategoryDto)
  categories!: MenuCategoryDto[];
}

export class CreateMenuSetupDto extends MenuContentDto {
  @IsString()
  @Length(2, 160)
  name!: string;

  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;

  @IsOptional()
  @IsEnum(MenuChannel)
  channel?: MenuChannel = MenuChannel.BOTH;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean = true;

  @IsOptional()
  @IsBoolean()
  publish?: boolean = true;
}

export class ReplaceMenuDraftDto extends MenuContentDto {
  @IsOptional()
  @IsString()
  @Length(2, 160)
  name?: string;

  @IsOptional()
  @IsEnum(MenuChannel)
  channel?: MenuChannel;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class SetSoldOutDto {
  @IsBoolean()
  soldOut!: boolean;

  @IsString()
  @Length(3, 500)
  reason!: string;
}
