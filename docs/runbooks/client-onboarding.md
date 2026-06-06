# Client Onboarding Runbook

## What one onboarding request creates

- Restaurant company tenant.
- First outlet with GST and service-charge settings.
- Owner account awaiting one-time activation.
- Owner, Manager, Cashier, Waiter, and Kitchen roles.
- Outlet access and permission assignments.
- Stripe card, Stripe PayNow, and manual PayNow defaults.
- Persisted eight-step launch checklist.
- Audit record of the operator who created the client.

## PowerShell workflow

Set the internal platform key for the terminal session:

```powershell
$env:PLATFORM_ADMIN_API_KEY = '<platform secret>'
```

Create the client:

```powershell
.\scripts\onboard-client.cmd `
  -CompanyName 'Example Restaurant Group' `
  -CompanySlug 'example-restaurant' `
  -OwnerName 'Jamie Tan' `
  -OwnerEmail 'jamie@example.com' `
  -OutletName 'Main Outlet' `
  -OutletSlug 'main' `
  -EnableServiceCharge
```

Stripe card and Stripe PayNow start enabled. Manual PayNow starts disabled. Use `-DisableStripeCard`, `-DisableStripePayNow`, or `-EnableManualPayNow` when a client needs different defaults.

Send the returned activation link to the owner. The owner sets a password and can then log in using the company slug and email address.

## Duplicate protection

Each request uses an idempotency key. Reusing the same key with the same client details returns the existing client. It does not create another company, outlet, or owner.

## Activation recovery

If the invitation expires before use:

```http
POST /api/v1/platform/onboarding/clients/{companyId}/reissue-activation
x-platform-key: <platform secret>
```

Reissuing invalidates all previous unused activation links.

## Setup checklist

The platform onboarding endpoint reports:

1. Business and first outlet
2. Owner account activation
3. Payment methods selected
4. Stripe account connected
5. First menu published
6. Tables and QR codes configured
7. Kitchen printer configured
8. Test order completed
