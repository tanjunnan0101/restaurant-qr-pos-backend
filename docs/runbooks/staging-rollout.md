# Staging Rollout Runbook

This runbook turns the backend handoff into an executable staging checklist.
Use it before any staff POS, KDS, or dashboard work continues.

## Goal

Bring up one cloud-hosted staging environment that uses:

- One managed PostgreSQL database.
- One managed Redis instance.
- One HTTPS API hostname.
- One HTTPS customer ordering hostname.
- One HitPay sandbox webhook endpoint.

The result should be a stable environment where the team can verify:

- Login and tenant access.
- Public QR resolution.
- Customer QR ordering page load and menu browse flow.
- HitPay hosted payment release.
- HitPay checkout cancel or failure recovery.
- Kitchen ticket and persisted print-job creation.
- Local printer-agent connectivity from a real Windows machine.

## Recommended Staging Shape

- API hostname: `api-staging.<your-domain>`
- Owner/staff app hostname placeholder: `app-staging.<your-domain>`
- Customer QR hostname placeholder: `order-staging.<your-domain>`
- One API instance is sufficient for staging.
- One customer web instance is sufficient for staging.
- One shared staging database is sufficient.
- One shared staging Redis instance is sufficient.

Do not use production HitPay keys, production webhooks, or live restaurant
printer credentials in staging.

## Required Inputs

Prepare these before deployment:

- Cloud provider and container-hosting target.
- Container registry target and naming convention.
- Managed PostgreSQL connection string.
- Managed Redis connection string.
- DNS record and HTTPS certificate for the API hostname.
- DNS record and HTTPS certificate for the customer hostname.
- HitPay sandbox business API key.
- HitPay webhook salt.
- Random values for `JWT_SECRET` and `PLATFORM_ADMIN_API_KEY`.

## Staging Environment Variables

Set these on the staging API service:

```text
NODE_ENV=production
PORT=3001
API_CORS_ORIGINS=https://order-staging.example.com,https://app-staging.example.com
DATABASE_URL=postgresql://...
REDIS_URL=rediss://...
JWT_SECRET=<at least 32 random characters>
JWT_EXPIRES_IN_SECONDS=3600
PLATFORM_ADMIN_API_KEY=<at least 32 random characters>
OWNER_APP_BASE_URL=https://app-staging.example.com
CUSTOMER_APP_BASE_URL=https://order-staging.example.com
ONBOARDING_TOKEN_TTL_HOURS=72
HITPAY_API_KEY=<hitpay sandbox api key>
HITPAY_WEBHOOK_SALT=<hitpay webhook salt>
HITPAY_API_URL=https://api.sandbox.hit-pay.com
```

An editable example file lives at:

- `infra/staging.api.env.example`

Build the customer web image with:

```text
NEXT_PUBLIC_API_BASE_URL=https://api-staging.example.com/api/v1
```

An editable example file lives at:

- `infra/staging.customer-web.build.env.example`

## Image Build And Release

Build the immutable release images from the validated repository root:

```powershell
.\scripts\build-release-images.ps1 `
  -Tag <git-sha> `
  -CustomerApiBaseUrl https://api-staging.example.com/api/v1
```

Before pushing or deploying a new image, run:

```powershell
npm run check
```

## Migration Procedure

Run database migrations as a one-off job before pointing traffic at the new
application images:

```powershell
docker run --rm `
  --env-file infra/staging.api.env.example `
  restaurant-pos-migrate:<git-sha>
```

Do not use `npm run prisma:migrate` outside local development.
Replace the placeholder values in the env file or export equivalent real staging
variables through the hosting platform. Do not run `npm run prisma:seed` on
staging unless you intentionally want demo tenant data there.

## Deployment Procedure

1. Run `npm run check`.
2. Build all three images tagged with the Git commit SHA.
3. Push the API, migration, and customer web images to the chosen registry.
4. Configure the staging API environment variables.
5. Run the migration image against the staging database.
6. Deploy the API image and wait for `GET /api/v1/health` to return `status: ok`.
7. Deploy the customer web image with the matching `NEXT_PUBLIC_API_BASE_URL`.
8. Open the customer hostname and confirm it serves the deployed build.
9. Create or confirm the HitPay sandbox webhook endpoint.
10. Run the smoke checklist below.

## HitPay Webhook Setup

Create a HitPay sandbox webhook endpoint:

```text
https://api-staging.example.com/api/v1/webhooks/hitpay
```

Register the webhook salt from that endpoint in the API environment as
`HITPAY_WEBHOOK_SALT`.

## Staging Smoke Checklist

Complete all of these before calling staging ready:

1. `GET /api/v1/health` returns `status: ok`.
2. `GET /` on the customer hostname returns the deployed Next.js app.
3. Swagger loads if intentionally enabled for staging.
4. Seeded or onboarded owner can log in.
5. Owner can create a menu, publish it, and configure a table QR.
6. Public QR resolve returns outlet, table, menu, and payment availability.
7. Opening a real QR URL on the customer hostname loads the menu correctly.
8. A HitPay sandbox payment marks the order paid exactly once.
9. A cancelled or failed HitPay sandbox flow returns the order to `PENDING_PAYMENT`.
10. Duplicate HitPay webhook delivery does not duplicate tickets or print jobs.
11. An amount mismatch leaves the order unreleased and records the failure safely.
12. A local Windows printer-agent machine can heartbeat successfully.
13. A queued test print can be leased, completed, and reflected in print-job status.

## Printer-Agent Staging Test

Use one real Windows machine on the same network as the target printer.

Required environment variables on that machine:

```text
PRINTER_API_BASE_URL=https://api-staging.example.com/api/v1
PRINTER_AGENT_ID=<agent id from printing setup>
PRINTER_AGENT_KEY=<one-time secret>
```

Validation sequence:

1. Configure station, printer, route, and agent through the admin printing setup API.
2. Start the agent.
3. Confirm heartbeat timestamps update in the API.
4. Queue a test print.
5. Confirm the job transitions to `PRINTED`.
6. Simulate failure and confirm retry or backup routing behavior.

## Exit Criteria

Staging is ready for frontend and operational testing only when:

- API health is stable.
- HitPay sandbox flows work end to end.
- Kitchen release is idempotent.
- Print jobs persist and transition correctly.
- One real printer-agent machine has been validated.
- The team can reproduce the deployment from this runbook without tribal knowledge.
