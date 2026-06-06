# ADR-004: Multi-tenant isolation

Status: Accepted

Run one SaaS deployment for all restaurant clients. Every tenant-owned record contains `company_id` and operational records contain `outlet_id` where relevant. Tenant and outlet access is derived from authenticated server context, never trusted from an arbitrary client header.
