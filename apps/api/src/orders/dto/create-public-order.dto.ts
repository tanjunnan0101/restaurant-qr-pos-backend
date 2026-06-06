import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod, ServiceType } from '@restaurant-pos/db';

export class PublicOrderItemDto {
  @IsUUID()
  menuItemId!: string;

  @IsOptional()
  @IsUUID()
  variantId?: string;

  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  modifierOptionIds?: string[] = [];

  @IsOptional()
  @IsString()
  @Length(1, 500)
  remarks?: string;
}

export class CreatePublicOrderDto {
  @IsOptional()
  @IsEnum(ServiceType)
  serviceType?: ServiceType = ServiceType.DINE_IN;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @IsString()
  @Length(1, 160)
  customerName?: string;

  @IsOptional()
  @IsString()
  @Length(3, 40)
  customerPhone?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PublicOrderItemDto)
  items!: PublicOrderItemDto[];
}
