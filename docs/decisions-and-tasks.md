# Engineering Decisions and Completed Tasks Log

**Project:** The Caesura — Inventory & Delivery Intake System for Specialty Coffee  
**Currency:** Philippine Peso (PHP, `Intl.NumberFormat('en-PH')`)  
**Timezone:** `Asia/Manila` (PHT, UTC+8)  
**Status:** Phase 0, 1, 2, and 3 Complete & Verified  

---

## 1. Architectural Decision Records (ADRs)

### ADR-01: Immutable Append-Only Ledger (`BR-1`, `BR-5`)
- **Problem:** In traditional inventory software, a mutable `stock_quantity` column is updated directly (`UPDATE products SET stock = stock - 5`). Over time, race conditions, partial writes, manual DB edits, or untracked shrinkage cause the stored number to drift away from physical reality with zero audit trail.
- **Decision:** Quantity on hand is strictly derived from the sum of immutable ledger entries in `stock_movements`. A database trigger (`prevent_stock_movement_mutation`) physically prohibits `UPDATE` and `DELETE` queries on the movement table at the PostgreSQL engine level. Mistakes are corrected by appending an offsetting movement (`adjustment`), never by editing history.
- **Trade-offs:** Deriving stock requires aggregation queries. We mitigate this with targeted indexes (`(batch_id, quantity)` and `(product_id, type)`) and a dedicated `product_stock_view`. For a single-site café scale (thousands of batches, 200 products), derived queries execute in < 2ms without caching complexity.

### ADR-02: Precise Financial Arithmetic via Integer Centavos & Decimal.js (`BR-7`)
- **Problem:** Native JavaScript binary floating-point arithmetic introduces rounding drift (e.g., `0.1 + 0.2 = 0.30000000000000004` or `95.50 * 100 = 9549.999999999999`), which compounds across thousands of ledger lines and corrupts tax and valuation reports.
- **Decision:** 
  1. All database monetary values are stored as integer minor units (`line_cost_cents`, `unit_cost_cents`, `last_pack_cost_cents`).
  2. All quantity conversions and unit-cost calculations use `decimal.js` with `ROUND_HALF_UP` and exact 3-decimal string serialization (`"1000.000"`).
- **Trade-offs:** Requires explicit conversion helpers (`majorUnitsToCents`, `formatMoneyPhp`) at presentation and extraction boundaries, but completely eliminates rounding anomalies.

### ADR-03: FEFO (First-Expired, First-Out) Consumption Engine (`FR-6`, `BR-2`)
- **Problem:** Perishable goods (fresh milk, plant milks, syrups, artisanal coffee beans) spoil if baristas grab arbitrary cartons. FIFO (First-In, First-Out) assumes items delivered earlier expire earlier, which is often false in the Philippines when suppliers deliver mixed batch production runs.
- **Decision:** 
  1. Depletion sorts batches strictly by `expiry_date ASC NULLS LAST`, then by `created_at ASC`.
  2. Expired batches are excluded from usable stock calculations (`usableQuantity`) and can never be consumed by usage operations.
  3. Shortfall atomicity: If requested quantity exceeds usable inventory, the transaction aborts and writes zero movements.
- **Trade-offs:** Requires batch-level tracking for every received delivery. Where products do not print explicit expiry dates, we estimate expiry as `delivery_date + shelf_life_days` marked as `expiry_source: 'estimated'`.

### ADR-04: Deterministic AI Verification & Guardrails (Rule 66)
- **Problem:** LLMs are non-deterministic, prone to hallucination, vulnerable to visual prompt injections (malicious notes printed on receipts), and unreliable at strict arithmetic validation.
- **Decision:** 
  1. The multimodal AI model (Gemini Vision / Qwen) is restricted strictly to **passive visual transcription**.
  2. The system prompt instructs the model that receipt text is untrusted visual data and must never be interpreted as instructions.
  3. All arithmetic checks (pack count × unit price vs line total, line totals vs invoice grand total), tax handling (VAT-inclusive vs 12% VAT breakdown), date plausibility, and catalogue matching are performed in **pure, deterministic TypeScript code**.
  4. **Zero Unconfirmed Writes:** No delivery receipt, batch, or ledger movement is ever written directly by an AI call. The user must review and click "Confirm Receipt".

### ADR-05: Pure Jaccard Trigram Matching (`pg_trgm` Compatible)
- **Problem:** Supplier delivery slips use abbreviations and idiosyncratic names (e.g., `"Barista Whole Milk 1L"` vs `"ND-FDM-1000 Fresh Dairy Barista Milk"`). Calling an LLM or embedding API for every line is slow, expensive, and non-deterministic.
- **Decision:** We implemented a pure, memory-only Jaccard trigram similarity matching engine (`trigramSimilarity`) that matches PostgreSQL `pg_trgm` output without requiring external libraries or database trips.
  - Tier 1: Exact `supplier_sku` or exact normalized description $\rightarrow$ `exact` match.
  - Tier 2: Trigram similarity against supplier items $\ge 0.6 \rightarrow$ `suggested` match (auto-selected).
  - Tier 3: Trigram similarity against product catalogue $\ge 0.4 \rightarrow$ `weak` candidate (not auto-selected, requires human confirmation).
  - Tier 4: Below threshold $\rightarrow$ `unmatched`.

### ADR-06: Zero Photo Persistence & In-Browser Canvas Compression
- **Problem:** Storing high-resolution supplier photos on disk or in S3 incurs recurring storage bills, violates zero-cost hosting principles, and increases surface area for data leaks.
- **Decision:** Photos are never stored to disk, database, or cloud object storage. They exist transiently in browser memory as an `ObjectUrl` and in the single-request POST body. A client-side canvas resizer (`src/lib/image-resize.ts`) scales images to a max dimension of 1600px at JPEG quality 0.82, keeping payload sizes below 500 KB while preserving full OCR text sharpness.

### ADR-07: Supplier Alias Learning Loop
- **Problem:** New products or newly formatted supplier descriptions require manual selection every time they arrive until someone remembers to update the catalogue.
- **Decision:** The intake review form includes a "Remember as supplier item" toggle (`saveSupplierAlias`). When checked, the delivery intake transaction atomically upserts a new record into `supplier_items`. Subsequent delivery receipts from that supplier match with 100% confidence on the exact tier.

### ADR-08: Evaluation Suite — Synthetic Fixtures & Offline Replay Benchmarks
- **Problem:** Running CI evaluation suites against live multimodal models costs API credits, risks rate-limiting in automated pipelines, and breaks when offline.
- **Decision:** 
  1. 10 synthetic Philippine receipt templates rendered to high-resolution PNGs via system headless Edge (`msedge --headless --screenshot`) paired with ground-truth `*.expected.json` files.
  2. The eval script (`evals/run.ts`) supports both live AI Gateway calls and an offline deterministic replay benchmark that validates schema parsing, centavo conversion, trigram matching, and plausibility checks deterministically with zero token costs.

### ADR-09: Purchase Order Row Locking & Physical vs. Intentional Separation
- **Problem:** Concurrent or split deliveries against the same Purchase Order can race on `received_pack_count` increments, and ordered quantities must never create phantom inventory before goods physically arrive.
- **Decision:**
  1. `batches` and `stock_movements` strictly record physically delivered quantities (`receiveDelivery`), while `purchase_orders` and `purchase_order_lines` track procurement intent and fulfillment progress.
  2. Linked deliveries execute `SELECT ... FOR UPDATE` on the parent PO row inside the atomic delivery transaction prior to receipt insertion, serializing split deliveries while preserving `idempotencyKey` deduplication.
  3. Pack cost variances (`actualPackCostCents - agreedPackCostCents`) are computed deterministically in integer centavos using `decimal.js` (`ROUND_HALF_UP`).

---

## 2. Completed Milestones and Task Breakdown

```
Phase 0: Foundations          [COMPLETED]
Phase 1: Core Ledger          [COMPLETED]
Phase 2: Views & Alerts       [COMPLETED]
Phase 3: AI Document Intake   [COMPLETED]
Phase 4: Purchase Orders      [COMPLETED]
Phase 5: Recipes & Sales      [UP NEXT]
```

### Phase 0: Foundations & Database Core
- [x] Initialized Next.js 16.4.5 (Turbopack), React 19.3.1, Tailwind CSS v4, TypeScript 6.
- [x] Pinned exact dependencies without caret ranges (`tech_stack.md`).
- [x] Set up PostgreSQL 17 in Docker (`caesura-postgres`) with Drizzle ORM 0.45.4.
- [x] Created database schema with strict constraints:
  - `products`, `suppliers`, `supplier_items`, `batches`, `receipts`, `receipt_lines`, `stock_movements`, `waste_events`, `stock_adjustments`, `settings`, `document_extractions`.
- [x] Implemented PostgreSQL triggers:
  - `prevent_stock_movement_mutation`: Append-only enforcement on `stock_movements`.
  - Non-negative stock constraints per batch.
- [x] Integrated Better Auth 1.7.18 with email/password and anonymous guest demo sessions.
- [x] Configured Vitest 4 with real PostgreSQL integration tests (`ledger-constraints.test.ts`, `auth.test.ts`).

### Phase 1: Core Ledger Mutations & Business Invariants
- [x] **Catalogue Mutations & Queries:**
  - Create, edit, and archive products and suppliers (`src/server/catalogue/`).
  - Active-only filtering; soft-archive prevents breaking historical ledger foreign keys.
- [x] **Delivery Receiving Transaction (`receiveDelivery`):**
  - Atomic transaction creating receipt, batches, receipt lines, and receipt movements.
  - Idempotency key deduplication to prevent double-submitting receipts.
  - Default shelf-life estimation (`expiry_source: 'estimated'`).
- [x] **FEFO Consumption Engine (`recordUsage`, `allocateFefo`):**
  - Earliest-expiry-first allocation across batches.
  - Skips expired batches.
  - Atomic shortfall rejection (writes zero records if stock is insufficient).
- [x] **Waste Write-Offs (`recordWaste`):**
  - Depletion reasons: `expired`, `spoiled`, `damaged`, `other`.
  - Historical batch cost tracking for waste financial valuation.
- [x] **Stock Adjustments (`recordAdjustment`):**
  - Role-gated to `admin` with mandatory reason note.

### Phase 2: Views, Alerts & Reporting
- [x] **Waste Financial Report (`/waste/report`):**
  - Aggregation service by reason, product, and date range in integer centavos.
  - Interactive date filtering and breakdown charts.
- [x] **Today Board (`/today`):**
  - Three real-time actionable work lists:
    1. Expired batches requiring immediate write-off (with inline write-off action).
    2. Use-soon batches expiring within warning window (default 3 days).
    3. Low-stock products at or below reorder point.
- [x] **Stock List & Batch Detail (`/catalogue`, `/products/[id]`):**
  - Live stock derived from `stock_movements` (usable vs expired).
  - Batch breakdown with shelf-life countdown and full immutable audit history.
- [x] **Realistic Philippine Café Seed Dataset:**
  - 5 categories (Coffee Beans, Dairy & Alternatives, Syrups & Sauces, Powders & Teas, Packaging).
  - 3 Philippine suppliers (Bukidnon Specialty Coffee, Northern Dairy Supply, Sweet Craft Syrups).
  - Pre-seeded scenarios: active stock, use-soon milk, expired cream, and past waste events.
- [x] **Settings Page (`/settings`):**
  - Currency fixed to PHP, timezone fixed to `Asia/Manila`.
  - Demo guardrails protecting global settings in demo mode (`FR-15`).

### Phase 3: AI Document Intake & Verification
- [x] **Step 3.1: Extraction Schema, Prompt & Model Call (`c4e29f9`)**
  - Zod 4 extraction schema (`ExtractedDocumentSchema`, `ExtractedLineSchema`).
  - Passive visual data system prompt with prompt-injection defense.
  - Centavo normaliser using `decimal.js` half-up rounding.
  - AI SDK 7 Vercel Gateway call with automatic retry on `NoObjectGeneratedError` and graceful `ai_unavailable` code fallback.
- [x] **Step 3.2: Trigram Matching & Plausibility Checks (`3649aa0`)**
  - Pure in-memory Jaccard trigram similarity algorithm (`src/server/extraction/trigram.ts`).
  - Multi-tiered matching hierarchy (exact SKU/alias $\rightarrow$ suggested $\ge 0.6 \rightarrow$ weak $\ge 0.4 \rightarrow$ unmatched).
  - 9 deterministic checks: `arithmetic_mismatch`, `total_mismatch`, `missing_expiry`, `implausible_expiry`, `date_implausible`, `supplier_mismatch`, `unmatched`, `weak_match`, `pack_unknown`.
- [x] **Step 3.3: Preflight, Rate Limiting & Route Handler (`2b2536c`)**
  - Magic bytes header validation (JPEG `FF D8 FF`, PNG `89 50 4E 47`, WebP `RIFF....WEBP`) capped at 4.0 MB.
  - Salted SHA-256 IP hashing (`hashClientIp`) with daily business-day caps (5 user / 10 IP / 50 global).
  - `/api/extractions` route handler with audit logging to `document_extractions`.
- [x] **Step 3.4: Review UI & Learning Loop (`e479470`)**
  - Pinned side-by-side desktop review workspace with zoom and full-screen lightbox modal.
  - Client-side canvas resizer ($\le 1600\text{px}$, JPEG 0.82).
  - Match confidence pills, plausibility chips, and supplier alias learning loop toggle (`saveSupplierAlias`).
- [x] **Step 3.5: Eval Suite, Fixtures & Reporting (`60c4d83`, `83c4996`)**
  - 10 synthetic Philippine receipt fixtures rendered to PNG via headless Edge.
  - Paired `*.expected.json` ground-truth files.
  - Multi-tier metric evaluator (`evals/metrics.ts`) measuring field-level accuracy and latency.
  - CLI runner (`pnpm eval:extraction`) supporting both live gateway inferences and offline replay benchmarks.
  - 1-click sample delivery note presets on `/receive` dropzone for instant demo evaluation.
  - Aligned column heights and label baselines across review form line items (`13d1cd5`).

### Phase 4: Purchase Orders (PO Procurement Lifecycle)
- [x] **Step 4.1: PO Schema, Migration, Validators & Engine (`95e1555`)**
  - Added `purchase_order_status` enum (`draft`, `submitted`, `partially_received`, `completed`, `cancelled`), `purchase_orders`, `purchase_order_lines`, and optional `receipts.purchase_order_id` (`0002_green_puma.sql`).
  - Implemented sequential yearly PO number generator (`PO-YYYY-####`), atomic `createPurchaseOrder`, row-locked `cancelPurchaseOrder` guardrail, and list/detail queries (`src/server/orders/orders.ts`).
- [x] **Step 4.2: Delivery Intake Linking & Variance Engine (`eea787e`)**
  - Extended `receiveDelivery` to lock linked POs (`FOR UPDATE`), match lines, increment `received_pack_count`, detect pack-cost variances, and transition PO statuses (`partially_received` / `completed`).
  - Verified idempotency, split deliveries, cost variance flags, and physical-vs-ordered stock separation in PostgreSQL integration tests (`ledger.test.ts`).
- [x] **Step 4.3: Purchase Orders UI & `/receive` Integration (`c043673`, `eab040c`)**
  - Added **Orders** navigation tab and `/orders`, `/orders/new`, and `/orders/[id]` routes with live ETA calculation, supplier-item presets, progress bars, short-delivery badges, and admin cancellation confirmation.
  - Integrated `?poId=...` pre-fill, **Link to Open Purchase Order** selector, and inline short-delivery / pack-cost variance indicators on `/receive`.

---

## 3. Git Commit History Reference

| Commit | Type | Description |
|---|---|---|
| `eab040c` | `fix(ui)` | Prevent navbar text wrapping and pluralize pack labels |
| `c043673` | `feat(orders)` | Add purchase orders UI routes and `/receive` PO linking |
| `eea787e` | `feat(ledger)` | Link delivery intake to purchase orders with row locking and variance detection |
| `95e1555` | `feat(orders)` | Add purchase orders schema, migration, validators, and engine |
| `d9854c1` | `feat(ui)` | Add dedicated AI extraction progress card, photo scanner badge, and shimmer skeleton state |
| `cb8ea2e` | `fix(receive)` | Prevent silent fallback to `products[0]`, surface unmatched badge, and show single candidate pills |
| `e479470` | `feat` | Add side-by-side photo intake review UI and supplier alias learning loop |
| `60c4d83` | `feat(evals)` | Add synthetic delivery receipt fixtures, eval runner, accuracy report, and demo sample loader |
| `83c4996` | `fix(evals)` | Distinguish offline replay benchmark from live gateway calls in reports |
| `13d1cd5` | `fix(ui)` | Align line item input heights and label baselines in receive form |
| `2b2536c` | `feat` | Add magic byte validation, salted IP rate limiter, and extraction route handler |
| `3649aa0` | `feat` | Add trigram matching engine and deterministic plausibility checks |
| `c4e29f9` | `feat` | Add AI document extraction schema, prompt, normaliser, and model call |
| `1f18a20` | `feat` | Add settings page with demo guardrails and navigation link |
| `f36e9d6` | `feat` | Seed realistic Philippine specialty café dataset |
| `131395c` | `feat` | Add Today board actionable work lists |
| `458e1c0` | `feat` | Add waste financial reporting and aggregation service |

---

## 4. Verification & Quality Metrics

- **Unit & Integration Test Suite:** 13 test files, 113 passed tests (`vitest run`).
- **Type Safety:** Zero TypeScript errors (`tsc --noEmit`).
- **Linting:** Zero ESLint warnings or errors (`eslint .`).
- **Extraction Benchmark:** 100% pass rate across 10/10 synthetic delivery note fixtures.

---

## 5. Upcoming Roadmap

### Phase 5: Recipes & POS Sales Depletion
1. **Menu Item Recipes:** Ingredient bill of materials (e.g., 18g espresso beans + 220ml whole milk per 8oz Flat White).
2. **Sales Import:** Webhook / CSV intake converting sold items into automated FEFO stock depletion movements.
3. **Sales Idempotency:** Duplicate sales batches rejected to prevent double deduction.
