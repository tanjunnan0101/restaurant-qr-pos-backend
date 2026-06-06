import type { PaymentMethod } from '@restaurant-pos/db';

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
  const now = input.now ?? new Date();
  const onlineEnabled = isToggleEffective(input.online, now);
  const stripeEnabled = isToggleEffective(input.stripe, now);

  return Object.fromEntries(
    input.methods.map((method) => {
      const methodEnabled = isToggleEffective(method, now);
      const needsStripe = method.method.startsWith('STRIPE_');
      return [
        method.method,
        onlineEnabled && methodEnabled && (!needsStripe || stripeEnabled),
      ];
    }),
  ) as Record<PaymentMethod, boolean>;
}
