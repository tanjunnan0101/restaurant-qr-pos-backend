import { IsEnum, IsInt, IsString, Length, Min } from 'class-validator';
import { OrderStatus } from '@restaurant-pos/db';

export class CancelOrderDto {
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class PrintPrePaymentBillDto {
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class VerifyManualPayNowDto {
  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsString()
  @Length(2, 160)
  reference!: string;

  @IsString()
  @Length(3, 500)
  reason!: string;
}

export const staffOrderStatuses = [
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.SERVED,
  OrderStatus.COMPLETED,
] as const;

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status!: (typeof staffOrderStatuses)[number];

  @IsString()
  @Length(3, 500)
  reason!: string;
}
