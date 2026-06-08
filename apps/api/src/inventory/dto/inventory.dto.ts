import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateInventoryItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 80)
  sku?: string;

  @ApiProperty()
  @IsString()
  @Length(2, 160)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  category?: string;

  @ApiProperty({ example: 'g' })
  @IsString()
  @Length(1, 40)
  baseUnit!: string;

  @ApiPropertyOptional({ example: 'kg' })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  purchaseUnit?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  conversionRate?: number;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  reorderPoint?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  lowStockAlertEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateInventoryItemDto extends PartialType(CreateInventoryItemDto) {
  @ApiProperty({ example: 'Renamed item and updated reorder point.' })
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class RecordInventoryMovementDto {
  @ApiProperty()
  @IsUUID()
  inventoryItemId!: string;

  @ApiProperty({ example: 2.5 })
  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @ApiPropertyOptional({ example: 'Emergency restock from supplier.' })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  reason?: string;
}

export class StockCountDto {
  @ApiProperty()
  @IsUUID()
  inventoryItemId!: string;

  @ApiProperty({ example: 8.25 })
  @IsNumber()
  @Min(0)
  actualQuantity!: number;

  @ApiProperty({ example: 'Weekly stock count.' })
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class RecipeIngredientDto {
  @ApiProperty()
  @IsUUID()
  inventoryItemId!: string;

  @ApiProperty({ example: 120 })
  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @ApiProperty({ example: 'g' })
  @IsString()
  @Length(1, 40)
  unit!: string;
}

export class UpsertRecipeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  saleDeductionEnabled?: boolean;

  @ApiProperty({ type: [RecipeIngredientDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RecipeIngredientDto)
  ingredients!: RecipeIngredientDto[];

  @ApiProperty({ example: 'Mapped BOM for sold-item stock deduction.' })
  @IsString()
  @Length(3, 500)
  reason!: string;
}
