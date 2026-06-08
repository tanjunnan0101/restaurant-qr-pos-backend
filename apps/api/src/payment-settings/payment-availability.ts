import { PaymentMethod } from '@restaurant-pos/db';

interface Toggle {
  enabled: boolean;
  disabledUntil: Date | null;
}

export function isToggleEffective(
  toggle: Toggle,
  now: Date = new Date(),
): boolean {
  return (
    toggle.enabled &&
    (!toggle.disabledUntil || toggle.disabledUntil.getTime() <= now.getTime())
  );
}

export function evaluatePaymentAvailability(input: {
  now?: Date;
  online: Toggle;
  stripe: Toggle;
  methods: Array<{
    method: PaymentMethod;
    enabled: boolean;
    disabledUntil: Date | null;
  }>;
}): Record<PaymentMethod, boolean> {
  const effective = evaluateMethodEffectiveness(input);
  const customerSupportedMethods = new Set<PaymentMethod>([
    PaymentMethod.ONLINE_CARD,
  ]);

  return Object.fromEntries(
    Object.entries(effective).map(([method, enabled]) => [
      method,
      customerSupportedMethods.has(method as PaymentMethod) && enabled,
    ]),
  ) as Record<PaymentMethod, boolean>;
}

export function evaluateMethodEffectiveness(input: {
  now?: Date;
  online: Toggle;
  stripe: Toggle;
  methods: Array<{
    method: PaymentMethod;
    enabled: boolean;
    disabledUntil: Date | null;
  }>;
}): Record<PaymentMethod, boolean> {
  const now = input.now ?? new Date();
  const onlineEnabled = isToggleEffective(input.online, now);
  const stripeEnabled = isToggleEffective(input.stripe, now);
  const hostedCheckoutMethods = new Set<PaymentMethod>([
    PaymentMethod.ONLINE_CARD,
    PaymentMethod.STRIPE_PAYNOW,
  ]);

  return Object.fromEntries(
    input.methods.map((method) => {
      const methodEnabled = isToggleEffective(method, now);
      const needsStripe = hostedCheckoutMethods.has(method.method);
      return [
        method.method,
        needsStripe
          ? onlineEnabled && methodEnabled && stripeEnabled
          : methodEnabled,
      ];
    }),
  ) as Record<PaymentMethod, boolean>;
}
