# vinext-starter

A clean full-stack starter running on
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

### Small transfer ZIP (Windows)

Run `npm run zip:transfer`. The compressed archive is saved in `outputs/`.
It includes source code and project data, while skipping dependencies, generated
builds, caches, old archives, local runtime storage (`data-store`), credentials
(`.env*`, `.auth`, private keys), and Git history. This is a source transfer,
not a full backup of local database/runtime state. Keep any required runtime
data and environment settings separately. On the receiving computer, extract
the ZIP, configure `.env`, and run `npm ci` before starting the app.

```bash
npm install
npm run dev
npm run build
```

## CDC backend

The dashboard now uses a Cloudflare D1 database (`DB`) instead of browser local storage.

- `POST /api/uploads` validates and imports Product Catalog, Business Report, and Order Excel workbooks.
- Every successful upload is an immutable snapshot. A new catalog is compared only with the latest previous catalog.
- Catalog comparison records missing ASINs, replacement ASINs matched by SKU, and field-by-field changes across every supplied catalog column.
- `GET /api/dashboard`, `GET /api/tracking`, and `GET /api/uploads` power the existing UI.
- `POST /api/tracking/merge` preserves a confirmed previous-to-current ASIN link in history.
- Order imports intentionally exclude buyer contact and shipping-address fields.

Generate a migration after schema changes with `npm run db:generate`. The checked-in `drizzle/0000_silky_jocasta.sql` initializes the current schema and must be applied to the deployment's D1 database.

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Email and name are intended for display or contact purposes.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes
- `npm run amazon:sync`: manually refresh the Amazon catalog, listings, and Account Health.
- `npm run amazon:auto-sync:configure`: save the automatic-sync status. On Windows, run `scripts/install-amazon-auto-sync-task.ps1` once to create the daily Task Scheduler job. The worker runs sequentially, preserves the existing encrypted data on a failed pull, and does not run overlapping syncs.
- `npm run amazon:reset-pull-data`: clear only saved Amazon pull storage. It does not delete dashboard Excel uploads or the application database.
- `npm run amazon:backfill`: pull two calendar years of Amazon order-report history in 30-day, resumable report batches, then future daily syncs refresh the most recent seven days.
- `npm run amazon:sync-database`: replace the configured CDC dashboard account’s catalog and order records with the latest encrypted Amazon pull. Daily automation runs this after the Amazon pulls finish.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)

Sales & Profit uses the saved Amazon SP-API order reports and latest catalog snapshot, rather than the reference workbook. Open Sales & Profit below Amazon Account Health, choose dates, and use **Pull latest from Amazon** to refresh orders, financial transactions and listings. Scheduled Amazon sync also refreshes financial transactions for the last 60 days. Manual pulls include the preceding comparison period.

Financial pulls try Finances API 2024-06-19, then the account-authorized v0 Financial Events API when the modern endpoint denies access. Legacy component amounts and original events are retained; unavailable legacy net totals are not fabricated. Account-level/undated events are preserved separately from dated marketplace summaries. Failed pulls preserve the last complete finance snapshot and show an error. Transactions and fee breakdowns retain currency, status and posted date; sales use order purchase date. Product/handling costs are seller inputs, so actual profit remains unavailable until those costs are supplied. The supplied metric-logic reference authorizes a $2/unit estimated handling charge. Provisional profit deducts this handling only and is labelled separately from actual profit. Actual cost/profit and refund-adjusted order counts remain unavailable until their required source inputs are available. Order headline counts follow COUNT(order records), not distinct order IDs.

Sales & Profit stock joins catalog seller SKUs to FBA Inventory fulfillable quantities; merchant listings retain their listing quantity. The page pull also refreshes FBA inventory. Prior-period stock remains unavailable without an appropriate historical snapshot.

Six-month Sales & Profit history covers the rolling calendar range shown in its own panel; boundary months are labelled partial. Monthly FBA ledger balances use US SELLABLE-disposition warehouse units and are separate from active/fulfillable listing counts. Completed broad finance backfills are retained in the encrypted history snapshot. Actual dated stock snapshots are used for prior-period comparisons, and subsequent inventory pulls preserve same-day catalog/stock observations for future comparisons.
