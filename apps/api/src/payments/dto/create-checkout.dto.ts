import { PaymentMethod } from '@restaurant-pos/db';
import { IsIn, IsUrl } from 'class-validator';

export class CreateCheckoutDto {
  @IsIn([PaymentMethod.ONLINE_CARD])
  paymentMethod!: PaymentMethod;

  @IsUrl({ require_tld: false, require_protocol: true })
  successUrl!: string;

  @IsUrl({ require_tld: false, require_protocol: true })
  cancelUrl!: string;
}
