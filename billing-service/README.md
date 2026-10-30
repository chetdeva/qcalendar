# billing-service

Plans, subscriptions and lesson credits. Knows nothing about any one payment provider.

- A student's first tutoring lesson is free. After that a plan (monthly, or annual at 20% off) gives 15 classes per month; unused ones expire at period end.
- Price comes from the student's grade (`billing.plans`: elementary grades 1-5 $300, middle school 6-8 $350, high school 9-10 $400 a month). A grade that moves into another band changes the price at the next renewal.
- calendar-service calls `POST /v1/service/credits/reserve|release` (idempotent, one call per lesson and student).
- The gateway calls `POST /v1/webhooks/<gateway>` (via users-ui, `/api/webhooks/billing/<gateway>`).

## Adding or switching a payment gateway

1. Write `src/gateways/<name>.ts` implementing `PaymentGateway` (`src/gateway.ts`): create checkout, portal, cancel, change plan, and `parseWebhook` (verify the signature, return our `NormalizedEvent`). It reads its own keys from env vars prefixed with its name.
2. Register it in `src/gateways/index.ts`.
3. Run the same checks the fake passes (see the "gateway contract" tests in `src/billing.test.ts`) against its sample webhook payloads.
4. Set `BILLING_GATEWAY=<name>`. To switch without losing existing subscribers, keep the old one receiving webhooks with `BILLING_GATEWAYS_ALSO=<old>`.

Shipped adapters: `fake` (tests and local dev), `cashfree`, `razorpay`. Switching between them is `BILLING_GATEWAY=<name>` plus that gateway's keys (see `.env.example`).

`npm test` runs everything against an embedded Postgres and the fake gateway.
