# AI Document Intake Evaluation Report

- **Date:** 2026-11-11T12:18:18.667Z (Asia/Manila)
- **Model:** `google/gemini-2.5-flash`
- **Total Fixtures:** 10
- **Pass Rate:** 10/10 (100.0%)
- **Target Accuracy Check:**
  - SKU Match Rate: **100.0%** (Target: $\ge 90\%$)
  - Pack Count Rate: **100.0%** (Target: $\ge 95\%$)

## Fixture Results Table

| Fixture ID | Category | Supplier | Packs | Price | Expiry | SKU Match | Latency | Outcome |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `dr-clean-bukidnon-vat-inc` | clean | ✓ | 100% | 100% | 100% | 100% | 219ms | **PASS** |
| `dr-clean-packaging` | clean | ✓ | 100% | 100% | 100% | 100% | 138ms | **PASS** |
| `dr-clean-sweetcraft-syrups` | clean | ✓ | 100% | 100% | 100% | 100% | 124ms | **PASS** |
| `dr-degraded-blur` | degraded | ✓ | 100% | 100% | 100% | 100% | 290ms | **PASS** |
| `dr-degraded-shadow` | degraded | ✓ | 100% | 100% | 100% | 100% | 158ms | **PASS** |
| `dr-long-items` | supplier_variation | ✓ | 100% | 100% | 100% | 100% | 176ms | **PASS** |
| `dr-no-prices` | edge_case | ✓ | 100% | 100% | 100% | 100% | 273ms | **PASS** |
| `dr-printed-expiry` | edge_case | ✓ | 100% | 100% | 100% | 100% | 308ms | **PASS** |
| `not-a-receipt` | negative | ✓ | 100% | 100% | 100% | 100% | 288ms | **PASS** |
| `si-clean-northern-dairy-vat-ex` | clean | ✓ | 100% | 100% | 100% | 100% | 238ms | **PASS** |

## Notes and Observations

- **not-a-receipt**: Correctly identified non-receipt / returned 0 lines without phantom records.

---
*Generated autonomously by `evals/run.ts` for The Caesura Phase 3 verification.*
