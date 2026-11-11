# AI Document Intake Evaluation Report

- **Date:** 2026-11-11T12:16:48.881Z (Asia/Manila)
- **Model:** `google/gemini-2.5-flash`
- **Total Fixtures:** 10
- **Pass Rate:** 1/10 (10.0%)
- **Target Accuracy Check:**
  - SKU Match Rate: **10.0%** (Target: $\ge 90\%$)
  - Pack Count Rate: **100.0%** (Target: $\ge 95\%$)

## Fixture Results Table

| Fixture ID | Category | Supplier | Packs | Price | Expiry | SKU Match | Latency | Outcome |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `dr-clean-bukidnon-vat-inc` | clean | ✓ | 100% | 100% | 100% | 0% | 186ms | **FAIL** |
| `dr-clean-packaging` | clean | ✓ | 100% | 100% | 100% | 0% | 128ms | **FAIL** |
| `dr-clean-sweetcraft-syrups` | clean | ✓ | 100% | 100% | 100% | 0% | 296ms | **FAIL** |
| `dr-degraded-blur` | degraded | ✓ | 100% | 100% | 100% | 0% | 150ms | **FAIL** |
| `dr-degraded-shadow` | degraded | ✓ | 100% | 100% | 100% | 0% | 244ms | **FAIL** |
| `dr-long-items` | supplier_variation | ✓ | 100% | 100% | 100% | 0% | 313ms | **FAIL** |
| `dr-no-prices` | edge_case | ✓ | 100% | 100% | 100% | 0% | 269ms | **FAIL** |
| `dr-printed-expiry` | edge_case | ✓ | 100% | 100% | 100% | 0% | 128ms | **FAIL** |
| `not-a-receipt` | negative | ✓ | 100% | 100% | 100% | 100% | 260ms | **PASS** |
| `si-clean-northern-dairy-vat-ex` | clean | ✓ | 100% | 100% | 100% | 0% | 139ms | **FAIL** |

## Notes and Observations

- **dr-clean-bukidnon-vat-inc**: Line 1 SKU: expected "BEANS-BKD-1KG", got "unmatched"; Line 2 SKU: expected "MILK-WM-1L", got "unmatched"
- **dr-clean-packaging**: Line 1 SKU: expected "PKG-CUP-8OZ", got "unmatched"; Line 2 SKU: expected "PKG-LID-8OZ", got "unmatched"
- **dr-clean-sweetcraft-syrups**: Line 1 SKU: expected "SYRUP-VAN-750", got "unmatched"; Line 2 SKU: expected "SYRUP-CAR-750", got "unmatched"; Line 3 SKU: expected "SAUCE-CHOC-1L", got "unmatched"
- **dr-degraded-blur**: Line 1 SKU: expected "BEANS-BKD-1KG", got "unmatched"
- **dr-degraded-shadow**: Line 1 SKU: expected "SYRUP-VAN-750", got "unmatched"
- **dr-long-items**: Line 1 SKU: expected "MILK-WM-1L", got "unmatched"; Line 2 SKU: expected "MILK-OAT-1L", got "unmatched"; Line 3 SKU: expected "MILK-WM-1L", got "unmatched"; Line 4 SKU: expected "SYRUP-VAN-750", got "unmatched"; Line 5 SKU: expected "SAUCE-CHOC-1L", got "unmatched"
- **dr-no-prices**: Line 1 SKU: expected "BEANS-BKD-1KG", got "unmatched"
- **dr-printed-expiry**: Line 1 SKU: expected "MILK-WM-1L", got "unmatched"; Line 2 SKU: expected "MILK-OAT-1L", got "unmatched"
- **not-a-receipt**: Correctly identified non-receipt / returned 0 lines without phantom records.
- **si-clean-northern-dairy-vat-ex**: Line 1 SKU: expected "MILK-WM-1L", got "unmatched"; Line 2 SKU: expected "MILK-OAT-1L", got "unmatched"

---
*Generated autonomously by `evals/run.ts` for The Caesura Phase 3 verification.*
