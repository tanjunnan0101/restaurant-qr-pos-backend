import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { paymentScopes, type PaymentScope } from '@restaurant-pos/types';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class DisablePaymentScopeDto {
  @ApiProperty({ enum: paymentScopes })
  @IsIn(paymentScopes)
  scope!: PaymentScope;

  @ApiPropertyOptional({
    description:
      'Future ISO timestamp. Omit to disable the selected scope indefinitely.',
  })
  @IsOptional()
  @IsDateString()
  until?: string;

  @ApiProperty({ example: 'PayNow unavailable during bank maintenance.' })
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class EnablePaymentScopeDto {
  @ApiProperty({ enum: paymentScopes })
  @IsIn(paymentScopes)
  scope!: PaymentScope;

  @ApiProperty({ example: 'Bank maintenance completed.' })
  @IsString()
  @Length(3, 500)
  reason!: string;
}
