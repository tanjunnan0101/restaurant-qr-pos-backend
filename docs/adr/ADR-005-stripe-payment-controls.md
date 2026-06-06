# ADR-005: Stripe payment integrity and controls

Status: Accepted

Each merchant will use a Stripe connected account. Stripe webhooks are the source of truth for successful online payments. Outlet operators can independently disable all online payments, all Stripe payments, Stripe card, Stripe PayNow, or manual PayNow. New payment attempts are blocked while already-created attempts remain eligible for trusted webhook completion.
