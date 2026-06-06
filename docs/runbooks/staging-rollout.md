# Staging Rollout Runbook

This runbook turns the backend handoff into an executable staging checklist.
Use it before any staff POS, KDS, or dashboard work continues.

## Goal

Bring up one cloud-hosted staging API that uses:

- One managed PostgreSQL database.
- One managed Redis instance.
- One HTTPS API hostname.
- One Stripe test webhook endpoint.

The result should be a stable environment where the team can verify:

- Login and tenant access.
- Public QR resolution.
- Stripe card payment release.
- Stripe PayNow asynchronous payment release.
- Kitchen ticket and persisted print-job creation.
- Local printer-agent connectivity from a real Windows machine.

## Recommended Staging Shape

- API hostname: `api-staging.<your-domain>`
- Owner/staff app hostname placeholder: `app-staging.<your-domain>`
- Customer QR hostname placeholder: `order-staging.<your-domain>`
- One API instance is sufficient for staging.
- One shared staging database is sufficient.
- One shared staging Redis instance is sufficient.

Do not use production Stripe keys, production webhooks, or live restaurant
printer credentials in staging.

## Required Inputs

Prepare these before deployment:

- Cloud provider and container-hosting target.
- Managed PostgreSQL connection string.
- Managed Redis connection string.
- DNS record and HTTPS certificate for the API hostname.
- Stripe test secret key.
- Stripe test webhook signing secret.
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
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Do not set these in staging:

- `STRIPE_API_HOST`
- `STRIPE_API_PORT`
- `STRIPE_API_PROTOCOL`

Those variables are only for the local Stripe stub.

## Image Build And Release

Build the immutable release image from the validated repository root:

```powershell
docker build -f infra/Dockerfile.api -t restaurant-pos-api:<git-sha> .
```

Before pushing or deploying a new image, run:

```powershell
npm run check
npm run smoke:stripe
```

## Migration Procedure

Run database migrations as a one-off job before pointing traffic at the new
image:

```powershell
npm ci
npm run prisma:generate
npm run prisma:deploy
```

Do not use `npm run prisma:migrate` outside local development.

Do not run `npm run prisma:seed` on staging unless you intentionally want demo
tenant data there.

## Deployment Procedure

1. Build the image tagged with the Git commit SHA.
2. Push the image to the chosen registry.
3. Configure the staging environment variables.
4. Run `npm run prisma:deploy` against the staging database.
5. Deploy the API image.
6. Wait for `GET /api/v1/health` to return `status: ok`.
7. Create or confirm the Stripe test webhook endpoint.
8. Run the smoke checklist below.

## Stripe Webhook Setup

Create a Stripe test-mode webhook endpoint:

```text
https://api-staging.example.com/api/v1/webhooks/stripe
```

Subscribe to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`

Confirm the webhook secret exactly matches the endpoint configured in Stripe.

## Staging Smoke Checklist

Complete all of these before calling staging ready:

1. `GET /api/v1/health` returns `status: ok`.
2. Swagger loads if intentionally enabled for staging.
3. Seeded or onboarded owner can log in.
4. Owner can create a menu, publish it, and configure a table QR.
5. Public QR resolve returns outlet, table, menu, and payment availability.
6. A Stripe card test payment marks the order paid exactly once.
7. A Stripe PayNow test flow stays `PROCESSING` until the async success arrives.
8. The successful PayNow event releases the kitchen exactly once.
9. Duplicate Stripe webhook delivery does not duplicate tickets or print jobs.
10. An amount mismatch leaves the order unreleased and records the failure safely.
11. A local Windows printer-agent machine can heartbeat successfully.
12. A queued test print can be leased, completed, and reflected in print-job status.

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
- Stripe test flows work end to end.
- Kitchen release is idempotent.
- Print jobs persist and transition correctly.
- One real printer-agent machine has been validated.
- The team can reproduce the deployment from this runbook without tribal knowledge.
