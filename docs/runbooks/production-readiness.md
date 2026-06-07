# Production Readiness Checklist

Use this after staging is stable and before accepting real restaurant payments.

## Infrastructure

- API deployed from `infra/Dockerfile.api`
- Customer web deployed from `infra/Dockerfile.customer-web`
- Migration job deployed from `infra/Dockerfile.migrate`
- Managed PostgreSQL backups enabled
- Managed Redis persistence and alerting configured
- HTTPS enabled for API and customer hostnames
- Central logs and uptime checks configured

## Secrets and payment safety

- `JWT_SECRET` rotated and stored in the hosting platform secret manager
- `PLATFORM_ADMIN_API_KEY` rotated and stored securely
- Live `HITPAY_API_KEY` configured only in production
- Live `HITPAY_WEBHOOK_SALT` configured only in production
- Any sandbox keys or salts exposed in chat or screenshots rotated
- Production webhook configured at `/api/v1/webhooks/hitpay`

## Database and release discipline

- Latest Prisma migrations applied exactly once
- Recent verified database backup available before deploy
- API and customer web images match the same Git commit
- `npm run check` passes before release

## Operational flow validation

- Owner can log in
- Menu can be published
- Table QR resolves correctly
- Customer can place a real paid order
- HitPay marks the order paid exactly once
- Duplicate webhook delivery is harmless
- Failed or cancelled payment returns the order to a recoverable state

## Printing

- One Windows printer-agent machine can heartbeat
- One kitchen ticket prints successfully
- One customer receipt prints successfully
- Retry and backup routing tested if backup printers are configured

## Known remaining gaps

- Staff POS frontend not built yet
- KDS frontend not built yet
- Owner dashboard frontend not built yet
- Authenticated Socket.IO rooms still pending
- Rate limiting and abuse protection still pending
- Error tracking, alerting, and restore drills still pending
