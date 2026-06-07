interface OnboardingChecklistSource {
  businessProfileCompletedAt: Date | null;
  ownerActivatedAt: Date | null;
  paymentMethodsSelectedAt: Date | null;
  stripeConnectedAt: Date | null;
  menuPublishedAt: Date | null;
  tablesConfiguredAt: Date | null;
  printerConfiguredAt: Date | null;
  testOrderCompletedAt: Date | null;
}

export function buildOnboardingChecklist(source: OnboardingChecklistSource) {
  return [
    {
      key: 'business_profile',
      label: 'Business and first outlet',
      completed: Boolean(source.businessProfileCompletedAt),
    },
    {
      key: 'owner_activation',
      label: 'Owner account activated',
      completed: Boolean(source.ownerActivatedAt),
    },
    {
      key: 'payment_methods',
      label: 'Payment methods selected',
      completed: Boolean(source.paymentMethodsSelectedAt),
    },
    {
      key: 'payment_provider_connection',
      label: 'HitPay account connected',
      completed: Boolean(source.stripeConnectedAt),
    },
    {
      key: 'menu',
      label: 'First menu published',
      completed: Boolean(source.menuPublishedAt),
    },
    {
      key: 'tables_and_qr',
      label: 'Tables and QR codes configured',
      completed: Boolean(source.tablesConfiguredAt),
    },
    {
      key: 'printer',
      label: 'Kitchen printer configured',
      completed: Boolean(source.printerConfiguredAt),
    },
    {
      key: 'test_order',
      label: 'Test order completed',
      completed: Boolean(source.testOrderCompletedAt),
    },
  ];
}
