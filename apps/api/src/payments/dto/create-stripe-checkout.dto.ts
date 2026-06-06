import { PaymentMethod } from '@restaurant-pos/db';
import { IsIn, IsUrl } from 'class-validator';

export class CreateStripeCheckoutDto {
  @IsIn([PaymentMethod.STRIPE_CARD, PaymentMethod.STRIPE_PAYNOW])
  paymentMethod!: PaymentMethod;

  @IsUrl({ require_tld: false, require_protocol: true })
  successUrl!: string;

  @IsUrl({ require_tld: false, require_protocol: true })
  cancelUrl!: string;
}
