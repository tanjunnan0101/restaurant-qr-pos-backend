# ADR-005: Hosted checkout integrity and controls

Status: Accepted

Hosted online checkout is the source of truth for successful customer payments.
Browser redirects never count as payment proof on their own. Outlet operators
can disable online payments globally or disable the current hosted checkout
method while leaving already-created payment attempts eligible for trusted
webhook completion. The current provider implementation is HitPay.
