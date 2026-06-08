import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { OrderSource, PaymentMethod, ServiceType } from '@restaurant-pos/db';

export class AdminOrderItemDto {
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

export class CreateAdminOrderDto {
  @IsUUID()
  menuId!: string;

  @IsOptional()
  @IsIn([OrderSource.POS, OrderSource.WAITER])
  source?: OrderSource = OrderSource.POS;

  @IsEnum(ServiceType)
  serviceType!: ServiceType;

  @IsIn([
    PaymentMethod.ONLINE_CARD,
    PaymentMethod.MANUAL_PAYNOW,
    PaymentMethod.CASH,
  ])
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @IsUUID()
  tableId?: string;

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
  @Type(() => AdminOrderItemDto)
  items!: AdminOrderItemDto[];
}
