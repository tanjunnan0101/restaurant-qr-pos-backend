# Backup And Restore Drill

Use this runbook before accepting live restaurant payments and repeat it on a
regular cadence after launch.

## Goal

Prove that the team can restore the production database into an isolated
environment, point the API at that restored copy, and verify that the core QR
ordering data is intact.

## Preconditions

- Managed PostgreSQL backups are enabled.
- The team knows how to create a fresh restore target without overwriting the
  live database.
- A temporary staging or drill environment exists for the API.
- Current production environment variables are documented.
- The latest migration history is committed and deployed.

## Safety rules

- Never restore over the live production database.
- Never point the live API at the drill restore target.
- Use fresh temporary credentials for the restored database when possible.
- Keep the restored environment private because it contains restaurant data.

## Inputs to capture before the drill

- Production API Git commit SHA
- Current production migration level
- Backup timestamp selected for restore
- Restore target hostname and database name
- Person running the drill
- Expected rollback path if the drill environment fails

## Restore procedure

1. Select a recent production backup or point-in-time restore target.
2. Restore it into a separate managed PostgreSQL instance or temporary
   database.
3. Record the restore start time and the time the restore becomes available.
4. Create least-privilege credentials for the drill API environment.
5. Point a temporary API environment at the restored database with:

```text
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=<temporary non-production secret>
PLATFORM_ADMIN_API_KEY=<temporary non-production key>
OWNER_APP_BASE_URL=https://drill-app.example.com
CUSTOMER_APP_BASE_URL=https://drill-order.example.com
SWAGGER_ENABLED=false
```

6. Start the API against the restored database.
7. Confirm `GET /api/v1/health` returns healthy dependency status.

## Functional verification

Run these checks against the temporary restore environment:

- Owner login succeeds for a known test tenant.
- At least one published menu can be read.
- At least one table QR can be resolved.
- At least one historical paid order can be retrieved.
- Payment records still match their orders.
- Print jobs still exist for previously paid orders when expected.

If the restored environment is allowed to reach HitPay or external services,
disable live side effects first. This drill is for restore confidence, not real
payment replay.

## Data consistency checks

Compare the restored environment against production expectations:

- Total company count
- Total outlet count
- Recent order count for the last known business day
- Recent paid order total for one known tenant
- Presence of the latest migration in `_prisma_migrations`

## Exit procedure

1. Record the health check result, smoke-test outcome, and restore duration.
2. Capture any missing data, schema mismatch, or runtime errors.
3. Tear down the temporary API environment.
4. Rotate any temporary secrets created for the drill.
5. Decide whether the restored database instance should be destroyed
   immediately or retained briefly for audit review.

## Pass criteria

- Restore completed without touching production.
- API booted successfully against the restored database.
- Core owner, QR, order, and payment reads succeeded.
- Team documented the elapsed restore time and any manual steps required.

## Follow-up if the drill fails

- Fix the backup retention or restore permissions issue.
- Fix missing migrations or environment configuration drift.
- Repeat the drill after the fix and attach the new result to the release log.
