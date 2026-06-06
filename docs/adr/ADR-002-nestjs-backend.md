# ADR-002: NestJS modular backend

Status: Accepted

Use a dedicated NestJS API for core business services. REST owns mutations, Socket.IO publishes operational updates, and modules preserve boundaries between authentication, tenancy, orders, payments, kitchen operations, printing, inventory, and reporting.
