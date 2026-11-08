# PRD: The Caesura

Status: Draft 2, 2026-11-01 (review decisions applied)
Related docs: `tech_stack.md`, `architecture.md`, `schema.md`, `rules.md`, `design.md`

## 1. Summary

The Caesura is a single-site inventory system for a small café in the Philippines (currency PHP, timezone Asia/Manila). It tracks stock by batch so it can handle expiry dates, and it turns a photo of a supplier delivery note into a draft stock receipt that a person reviews and confirms before anything is written.

There is no real client. The café is a fictional but realistic domain, chosen because perishables, pack sizes and delivery paperwork are everyday problems there.

## 2. Goals

Portfolio goals (what the project must demonstrate):

- G1. A correct inventory model: append-only movement ledger, quantity derived and never stored, batch-level expiry, FEFO consumption.
- G2. An AI feature with real engineering around it: schema-validated output, deterministic checks, fuzzy matching, human confirmation, measured accuracy.
- G3. A live, populated demo that a reviewer can use in under two minutes with no setup.
- G4. A README and docs that explain the design decisions, so the author can defend them in an interview.

Product goals (for the fictional café):

- P1. Receiving a delivery takes under two minutes instead of manual typing.
- P2. Staff always know what to use first and what to write off.
- P3. The owner can see what waste costs.

## 3. Non-goals

Multi-location, multi-tenant SaaS, live integration with a POS vendor (a sales import stands in for it in phase 5), recipe or bill-of-materials costing, barcode scanning, accounting export, native mobile apps, offline mode, internationalisation (English UI; PHP and Asia/Manila only), payments.

## 4. Users

| Persona | Role | Context |
|---|---|---|
| Maya, owner-manager | `admin` | Sets up catalogue and suppliers, reviews waste, makes corrections. |
| Sam, barista | `staff` | Phone or tablet, busy hands, receives deliveries, records usage and waste. Needs tasks done in seconds. |

## 5. Phases

| Phase | Content | Exit criteria |
|---|---|---|
| P0 Foundations | Repo, CI, Postgres, auth, migrations, seed script skeleton | CI green, sign in works locally |
| P1 Core ledger | Catalogue, manual receiving, usage with FEFO, waste, adjustments | Ledger invariants covered by integration tests |
| P2 Views and alerts | Today board, stock list, product detail, waste report, low-stock, expiry alerts, seed data, deploy | Demo live with realistic data |
| P3 AI receiving | Photo to draft receipt, review UI, rate limits, eval script | Eval report committed, demo has sample notes |
| P4 Purchase orders | Create PO, match delivery to PO, short-delivery flags | Receipt can reference a PO |
| P5 Recipes and sales import | Menu items with recipes (ingredients and quantities). Import sales from a CSV upload or a simulated webhook, convert them through recipes into usage movements using the same FEFO code. Idempotent: importing the same sales twice never deducts stock twice. | Seed script generates sales; importing a sales file lowers stock correctly |
| P6 Stretch | Reorder assistant (statistics for the forecast, LLM only to explain and draft the email), void receipt, per-guest workspaces | Optional |

## 6. Functional requirements

IDs are stable; refer to them in commits and tests.

### Catalogue

- FR-1. Admin can create, edit and archive products (SKU, name, category, base unit, tracks expiry, shelf life days, reorder point). Products are archived, never deleted once they have movements.
- FR-2. Admin can create, edit and archive suppliers (name, contact, lead time days).
- FR-3. Admin can define supplier items: how a supplier sells a product (description as printed, optional supplier SKU, pack label, base units per pack). These double as the alias table for matching.

### Receiving

- FR-4. Staff can receive a delivery manually: choose supplier, delivery date, optional reference, then lines (supplier item or product, pack count, cost, expiry). Each line creates one batch and one receipt movement in a single transaction.
- FR-5. Staff can receive a delivery from a photo (see section 7).
- Rule: for products that track expiry, every batch has an expiry date. If none is printed, it is estimated as delivery date plus shelf life days and marked `estimated`. If shelf life is unknown the user must enter a date.

### Consumption

- FR-6. Staff can record usage of a product. The system allocates across batches by FEFO (earliest expiry first, then earliest received) and writes one movement per batch. Expired batches are never consumed.
- FR-7. Staff can write off stock with a reason (`expired`, `spoiled`, `damaged`, `other`) and the system values it at batch cost.
- FR-8. Admin can record an adjustment (positive or negative) on a batch with a mandatory note.

### Views

- FR-9. Stock list: every active product with usable quantity, expired quantity, reorder point and status.
- FR-10. Product detail: batches with quantity and expiry, and the full movement history.
- FR-11. Today board: three work lists (write off expired, use soon, reorder), each actionable in place.
- FR-12. Waste report: value and quantity by reason, product and date range.

### Platform

- FR-13. Roles `admin` and `staff`. The owner account signs in with email and password. Reviewers get an instant guest account (see FR-14).
- FR-14. Demo mode: one click on "Try as a guest" creates a temporary account with the `admin` role and a random display name (for example Guest 7K2Q). There are no shared logins. Guests work on one shared demo dataset, which is reset nightly along with all guest accounts. Guest creation is rate limited per IP. Anonymous sign-in exists only when `DEMO_MODE=true`.
- FR-15. Settings: business name, currency (PHP), timezone (Asia/Manila), expiry warning days, extraction caps. Read-only in demo mode.
- FR-16. AI usage limits: per-user, per-IP and global daily extraction caps, enforced server-side. Guest accounts are free to create, so the global cap and a budget on the gateway key are the real limits.
- FR-17. Every extraction attempt is logged (model, tokens, latency, status).
- FR-18. A developer-run eval script reports extraction accuracy against fixtures.

### Business rules

- BR-1. Quantity on hand is always the sum of movements. It is never stored.
- BR-2. Usable stock excludes batches whose expiry date is before today in the business timezone.
- BR-3. A product is low on stock when usable quantity is at or below its reorder point.
- BR-4. Use-soon means expiry within `expiry_warning_days` (default 3), inclusive of today.
- BR-5. A movement is never edited or deleted. Mistakes are corrected with a new movement.
- BR-6. Stock for a batch can never go below zero.
- BR-7. Money is PHP, shown as `₱1,250.00` (`Intl.NumberFormat('en-PH')`). "Today" is the calendar day in Asia/Manila.

### Acceptance criteria (selected)

FR-6: Given milk batch A (4 L, expires Nov 3) and batch B (10 L, expires Nov 6), when usage of 6 L is recorded, then A drops by 4 L and B by 2 L under one movement group, and usable milk shows 8 L. Given usage of 20 L when only 14 L is usable, nothing is written and the message states a 6 L shortfall.

FR-5: Given a photo of a delivery note from a known supplier with five lines, when extraction finishes, then the review screen shows five lines, each with a match state; Confirm stays disabled while any line is unresolved; confirming creates one receipt, five batches and five movements; submitting twice creates them once.

FR-8: Given a staff user, adjustment is not available. Given an admin, an adjustment without a note is rejected.

## 7. AI feature: receive from photo

Flow: upload or capture photo, model transcribes, system validates and matches, user reviews, user confirms, ledger is written. Details in `architecture.md`.

Product rules:

- The model transcribes. Code computes. Money and quantity conversion, matching, and all checks happen in code.
- Philippine suppliers commonly issue Delivery Receipts and Sales Invoices, often with VAT lines. Total checks must accept both VAT-inclusive and VAT-exclusive line prices. Check against real examples when building fixtures.
- Nothing is written to stock until the user confirms. No exceptions.
- Fields the system is unsure about are highlighted. Confidence comes from deterministic checks (arithmetic, plausibility, match similarity), not from the model's own claims.
- A failed extraction falls back to the manual receiving form with the photo still visible.
- Photos are not stored. They exist in the browser and in the request only.

Initial accuracy targets (to be reset after the first eval run): at least 90 percent of lines end up with the correct product after matching, at least 95 percent of pack counts exact, zero writes without confirmation.

## 8. Non-functional requirements

- Correctness: ledger invariants enforced in the database (constraints, trigger) and tested against real Postgres.
- Performance: stock list for 200 products and a few thousand batches renders in under one second on the demo database. Extraction round trip target under 15 seconds.
- Mobile first: usable at 360 px width, touch targets at least 44 px.
- Accessibility: aim for WCAG 2.2 AA, keyboard operable, status never conveyed by colour alone.
- Security: server-side authorisation on every mutation, input validated at boundaries, uploaded files checked by content, no secrets in the client.
- Cost: the project must cost nothing. Hosting on Vercel Hobby, database on Neon Free, AI on the AI Gateway free credit, no card required anywhere. The demo cannot run up a bill because there is nothing to bill. Manual receiving works without AI.
- Security: dependencies are pinned at versions with no known unpatched advisories on the date of the last check (see `tech_stack.md`), with audit in CI.

## 9. Success metrics

Portfolio: live URL, README with design rationale, CI badge, eval report with numbers, a recorded demo walkthrough, and a "Limitations and next steps" section in the README that says manual usage entry is a stand-in for POS-driven depletion until phase 5.
Engineering: ledger integration tests including a concurrency test, zero uses of a mutable quantity column, extraction eval run for at least two models.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Model misreads messy photos | Deterministic checks, review step, eval fixtures that include bad photos |
| Delivery notes rarely print expiry | `estimated` expiry source, clearly marked, documented limitation |
| Vibe-coded drift (mutable quantities, skipped transactions) | `rules.md`, ledger module boundary, tests, review of ledger code by the author |
| Tooling churn (TypeScript 7, Drizzle 1.0 RC, Next 17) | Pin exact versions, upgrade deliberately after P2 |
| Demo abuse or free-tier exhaustion | Guest sign-in rate limit, per-IP and global caps, key budget, nightly reset. At worst the Hobby team is paused or the AI becomes unavailable. |
| The chosen AI model is not on the free tier | Test one request before building. Fall back to a free-tier vision model. Manual receiving always works. |
| A new vulnerability appears in a dependency | `pnpm audit` and Dependabot, monthly check of Next.js and Node.js advisories, pinned minimums in `rules.md` |
| Guests share one dataset, so one guest's usage changes what others see | Nightly reset, documented in the README; per-guest workspaces are a phase 5 option |

## 11. Decisions and open questions

Decided (2026-11-01):

1. Product name: The Caesura.
2. Currency PHP, timezone Asia/Manila.
3. Reviewers get instant temporary guest accounts, not shared logins.
4. Visual direction in `design.md` approved.

Open:

5. Purchase orders: kept in phase 4 unless you decide otherwise.
6. Per-guest isolated workspaces (each guest gets private data). Not planned; it would need a workspace id on every table. Candidate for phase 6.
