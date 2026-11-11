# AI Document Intake Evaluation Report

- **Date:** 2026-11-11T12:50:37.547Z (Asia/Manila)
- **Execution Mode:** Offline Replay / Deterministic Fixture Benchmark (Zero live API calls)
- **Target Model Architecture:** `google/gemini-2.5-flash`
- **Total Fixtures:** 10
- **Pass Rate:** 10/10 (100.0%)
- **Target Accuracy Check:**
  - SKU Match Rate: **100.0%** (Target: $\ge 90\%$)
  - Pack Count Rate: **100.0%** (Target: $\ge 95\%$)

> [!NOTE]
> This benchmark ran in offline deterministic mode using synthetic fixture transcriptions to verify schema parsing, currency centavo conversion, Jaccard trigram matching, and deterministic plausibility checks without consuming live API tokens.

## Fixture Results Table

| Fixture ID | Category | Supplier | Packs | Price | Expiry | SKU Match | Latency | Outcome |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `dr-clean-bukidnon-vat-inc` | clean | ✓ | 100% | 100% | 100% | 100% | 202ms | **PASS** |
| `dr-clean-packaging` | clean | ✓ | 100% | 100% | 100% | 100% | 171ms | **PASS** |
| `dr-clean-sweetcraft-syrups` | clean | ✓ | 100% | 100% | 100% | 100% | 290ms | **PASS** |
| `dr-degraded-blur` | degraded | ✓ | 100% | 100% | 100% | 100% | 206ms | **PASS** |
| `dr-degraded-shadow` | degraded | ✓ | 100% | 100% | 100% | 100% | 184ms | **PASS** |
| `dr-long-items` | supplier_variation | ✓ | 100% | 100% | 100% | 100% | 150ms | **PASS** |
| `dr-no-prices` | edge_case | ✓ | 100% | 100% | 100% | 100% | 237ms | **PASS** |
| `dr-printed-expiry` | edge_case | ✓ | 100% | 100% | 100% | 100% | 194ms | **PASS** |
| `not-a-receipt` | negative | ✓ | 100% | 100% | 100% | 100% | 138ms | **PASS** |
| `si-clean-northern-dairy-vat-ex` | clean | ✓ | 100% | 100% | 100% | 100% | 267ms | **PASS** |

## Notes and Observations

- **not-a-receipt**: Correctly identified non-receipt / returned 0 lines without phantom records.

---
*Generated autonomously by `evals/run.ts` for The Caesura Phase 3 verification.*
