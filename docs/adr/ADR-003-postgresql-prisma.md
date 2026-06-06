# ADR-003: PostgreSQL and Prisma

Status: Accepted

Use PostgreSQL for transactional integrity and Prisma for typed schema management and migrations. Money will be represented as integer cents. High-risk operations and their audit records must commit in the same transaction.
