import { describe, expect, it } from 'vitest';
import { buildOnboardingChecklist } from './onboarding-checklist';

describe('onboarding checklist', () => {
  it('shows automated initial setup steps as complete', () => {
    const now = new Date();
    const checklist = buildOnboardingChecklist({
      businessProfileCompletedAt: now,
      ownerActivatedAt: null,
      paymentMethodsSelectedAt: now,
      stripeConnectedAt: null,
      menuPublishedAt: null,
      tablesConfiguredAt: null,
      printerConfiguredAt: null,
      testOrderCompletedAt: null,
    });

    expect(checklist.filter(({ completed }) => completed)).toHaveLength(2);
    expect(
      checklist.find(({ key }) => key === 'owner_activation')?.completed,
    ).toBe(false);
  });
});
