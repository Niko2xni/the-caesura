import { describe, expect, it } from 'vitest';
import { runDocumentChecks } from './checks';
import { matchExtractedLine, matchExtractedLines, type ProductCandidate, type SupplierItemCandidate } from './match';
import type { NormalisedExtractedDocument, NormalisedExtractedLine } from './normalise';
import { trigramSimilarity } from './trigram';

describe('Trigram Similarity, Matching Engine & Plausibility Checks', () => {
  const sampleProducts: ProductCandidate[] = [
    {
      id: 'prod-milk-1l',
      name: 'Barista Whole Milk (1L)',
      nameNormalized: 'barista whole milk 1l',
      sku: 'MILK-WHOLE-1L',
      baseUnit: 'ml',
      tracksExpiry: true,
      shelfLifeDays: 14,
    },
    {
      id: 'prod-apo-1kg',
      name: 'Mount Apo Natural Arabica (1kg)',
      nameNormalized: 'mount apo natural arabica 1kg',
      sku: 'BEAN-APO-1KG',
      baseUnit: 'g',
      tracksExpiry: true,
      shelfLifeDays: 60,
    },
    {
      id: 'prod-special-blend',
      name: 'Specialty Seasonal Cold Brew Blend',
      nameNormalized: 'specialty seasonal cold brew blend',
      sku: 'BEAN-SEAS-BLEND',
      baseUnit: 'g',
      tracksExpiry: true,
      shelfLifeDays: null, // Tracks expiry with NO default shelf life!
    },
    {
      id: 'prod-cups-12oz',
      name: '12oz Hot Paper Cup (50s)',
      nameNormalized: '12oz hot paper cup 50s',
      sku: 'CUP-12OZ-50',
      baseUnit: 'each',
      tracksExpiry: false,
      shelfLifeDays: null,
    },
  ];

  const sampleSupplierItems: SupplierItemCandidate[] = [
    {
      id: 'item-milk-pbc',
      supplierId: 'supp-pbc',
      productId: 'prod-milk-1l',
      productName: 'Barista Whole Milk (1L)',
      supplierSku: 'PBC-MILK-1L',
      description: 'Barista Whole Milk 1L Tetra Pak',
      descriptionNormalized: 'barista whole milk 1l tetra pak',
      packLabel: '1L Carton',
      packQuantity: '1000.000',
      lastPackCostCents: 9500,
    },
    {
      id: 'item-apo-mcx',
      supplierId: 'supp-mcx',
      productId: 'prod-apo-1kg',
      productName: 'Mount Apo Natural Arabica (1kg)',
      supplierSku: 'MCX-APO-1K',
      description: 'Mount Apo Specialty Natural 1kg Bag',
      descriptionNormalized: 'mount apo specialty natural 1kg bag',
      packLabel: '1kg Bag',
      packQuantity: '1000.000',
      lastPackCostCents: 110000,
    },
  ];

  describe('trigramSimilarity (Jaccard trigram matching)', () => {
    it('returns 1.0 for identical strings', () => {
      expect(trigramSimilarity('barista whole milk', 'barista whole milk')).toBe(1.0);
      expect(trigramSimilarity('', '')).toBe(1.0);
      expect(trigramSimilarity(null, null)).toBe(1.0);
    });

    it('returns 0.0 when one string is null or empty', () => {
      expect(trigramSimilarity('milk', null)).toBe(0.0);
      expect(trigramSimilarity('', 'milk')).toBe(0.0);
    });

    it('returns high similarity for minor typographic variations', () => {
      const sim = trigramSimilarity('barista whole milk 1l', 'barista whole milk 1l tetra pak');
      expect(sim).toBeGreaterThanOrEqual(0.6);
    });

    it('returns very low similarity for completely unrelated items', () => {
      const sim = trigramSimilarity('fresh milk', 'plastic cups 12oz');
      expect(sim).toBeLessThan(0.2);
    });
  });

  describe('matchExtractedLine', () => {
    it('matches exactly by supplier SKU (case-insensitive)', () => {
      const line: NormalisedExtractedLine = {
        description: 'Random Printed Description',
        descriptionNormalized: 'random printed description',
        supplierSku: 'pbc-milk-1l', // lowercase match
        packCount: '6.000',
        packLabel: null,
        unitPriceCents: 9500,
        lineTotalCents: 57000,
        expiryDate: '2026-11-24',
        lotCode: null,
      };

      const result = matchExtractedLine(line, sampleSupplierItems, sampleProducts);
      expect(result.matchMethod).toBe('exact');
      expect(result.selectedProductId).toBe('prod-milk-1l');
      expect(result.selectedSupplierItemId).toBe('item-milk-pbc');
      expect(result.packQuantity).toBe('1000.000');
      expect(result.score).toBe(1.0);
    });

    it('matches exactly by normalized description', () => {
      const line: NormalisedExtractedLine = {
        description: 'Barista Whole Milk 1L Tetra Pak',
        descriptionNormalized: 'barista whole milk 1l tetra pak',
        supplierSku: null,
        packCount: '10.000',
        packLabel: null,
        unitPriceCents: 9500,
        lineTotalCents: 95000,
        expiryDate: null,
        lotCode: null,
      };

      const result = matchExtractedLine(line, sampleSupplierItems, sampleProducts);
      expect(result.matchMethod).toBe('exact');
      expect(result.selectedProductId).toBe('prod-milk-1l');
      expect(result.selectedSupplierItemId).toBe('item-milk-pbc');
    });

    it('suggests supplier item when trigram score >= 0.6 and auto-selects top candidate', () => {
      const line: NormalisedExtractedLine = {
        description: 'Barista Whole Milk 1L Tetra',
        descriptionNormalized: 'barista whole milk 1l tetra',
        supplierSku: null,
        packCount: '4.000',
        packLabel: null,
        unitPriceCents: null,
        lineTotalCents: null,
        expiryDate: null,
        lotCode: null,
      };

      const result = matchExtractedLine(line, sampleSupplierItems, sampleProducts);
      expect(result.matchMethod).toBe('suggested');
      expect(result.selectedProductId).toBe('prod-milk-1l');
      expect(result.selectedSupplierItemId).toBe('item-milk-pbc');
      expect(result.score).toBeGreaterThanOrEqual(0.6);
      expect(result.candidates).toHaveLength(1);
    });

    it('identifies weak product candidates (score >= 0.4) but does NOT auto-select', () => {
      const line: NormalisedExtractedLine = {
        description: 'Hot Paper Cups',
        descriptionNormalized: 'hot paper cups',
        supplierSku: null,
        packCount: '5.000',
        packLabel: null,
        unitPriceCents: null,
        lineTotalCents: null,
        expiryDate: null,
        lotCode: null,
      };

      const result = matchExtractedLine(line, sampleSupplierItems, sampleProducts);
      expect(result.matchMethod).toBe('manual');
      expect(result.selectedProductId).toBeNull(); // NOT auto-selected!
      expect(result.candidates.length).toBeGreaterThan(0);
      expect(result.candidates[0].productId).toBe('prod-cups-12oz');
      expect(result.candidates[0].source).toBe('product');
    });

    it('returns unmatched for unknown items with score < 0.4', () => {
      const line: NormalisedExtractedLine = {
        description: 'Industrial Heavy Duty Floor Cleaner 5L',
        descriptionNormalized: 'industrial heavy duty floor cleaner 5l',
        supplierSku: null,
        packCount: '1.000',
        packLabel: null,
        unitPriceCents: null,
        lineTotalCents: null,
        expiryDate: null,
        lotCode: null,
      };

      const result = matchExtractedLine(line, sampleSupplierItems, sampleProducts);
      expect(result.matchMethod).toBe('manual');
      expect(result.selectedProductId).toBeNull();
      expect(result.candidates).toHaveLength(0);
    });
  });

  describe('runDocumentChecks', () => {
    const baseDocument: NormalisedExtractedDocument = {
      supplierName: 'Pacific Beverage Co.',
      supplierNameNormalized: 'pacific beverage co',
      documentNumber: 'DR-1092',
      deliveryDate: '2026-11-10',
      currency: 'PHP',
      subtotalCents: 19000,
      vatAmountCents: 2280,
      totalCents: 21280,
      lines: [
        {
          description: 'Barista Whole Milk 1L',
          descriptionNormalized: 'barista whole milk 1l',
          supplierSku: 'PBC-MILK-1L',
          packCount: '2.000',
          packLabel: '1L',
          unitPriceCents: 9500, // 2 * 9500 = 19000
          lineTotalCents: 19000,
          expiryDate: '2026-11-24',
          lotCode: 'LOT-01',
        },
      ],
    };

    const businessToday = '2026-11-11';

    it('passes a clean, mathematically consistent document with no flags', () => {
      const lineMatches = matchExtractedLines(baseDocument.lines, sampleSupplierItems, sampleProducts);
      const checks = runDocumentChecks({
        document: baseDocument,
        lineMatches,
        products: sampleProducts,
        chosenSupplierName: 'Pacific Beverage Co.',
        businessToday,
      });

      expect(checks.documentFlags).toHaveLength(0);
      expect(checks.lineChecks[0].flags).toHaveLength(0);
    });

    it('flags arithmetic_mismatch when packCount * unitPrice != lineTotal', () => {
      const docWithMathError: NormalisedExtractedDocument = {
        ...baseDocument,
        lines: [
          {
            ...baseDocument.lines[0],
            packCount: '3.000',
            unitPriceCents: 9500, // 3 * 9500 = 28500
            lineTotalCents: 35000, // OCR error says 35000
          },
        ],
      };

      const lineMatches = matchExtractedLines(docWithMathError.lines, sampleSupplierItems, sampleProducts);
      const checks = runDocumentChecks({
        document: docWithMathError,
        lineMatches,
        products: sampleProducts,
        businessToday,
      });

      expect(checks.lineChecks[0].flags).toContain('arithmetic_mismatch');
    });

    it('flags total_mismatch when sum of lines matches neither subtotal nor grand total', () => {
      const docWithTotalError: NormalisedExtractedDocument = {
        ...baseDocument,
        subtotalCents: 50000,
        totalCents: 56000,
        lines: [
          {
            ...baseDocument.lines[0],
            lineTotalCents: 19000, // sum of lines = 19000 != 50000 or 56000
          },
        ],
      };

      const lineMatches = matchExtractedLines(docWithTotalError.lines, sampleSupplierItems, sampleProducts);
      const checks = runDocumentChecks({
        document: docWithTotalError,
        lineMatches,
        products: sampleProducts,
        businessToday,
      });

      expect(checks.documentFlags).toContain('total_mismatch');
    });

    it('accepts both VAT-inclusive and VAT-exclusive line pricing without total_mismatch', () => {
      // Case 1: Line totals sum to subtotal (VAT-exclusive)
      const vatExclusiveDoc: NormalisedExtractedDocument = {
        ...baseDocument,
        subtotalCents: 19000,
        totalCents: 21280, // lines sum to subtotal 19000
      };
      const checksExclusive = runDocumentChecks({
        document: vatExclusiveDoc,
        lineMatches: matchExtractedLines(vatExclusiveDoc.lines, sampleSupplierItems, sampleProducts),
        products: sampleProducts,
        businessToday,
      });
      expect(checksExclusive.documentFlags).not.toContain('total_mismatch');

      // Case 2: Line totals sum to grand total (VAT-inclusive)
      const vatInclusiveDoc: NormalisedExtractedDocument = {
        ...baseDocument,
        subtotalCents: 19000,
        totalCents: 21280,
        lines: [
          {
            ...baseDocument.lines[0],
            lineTotalCents: 21280, // lines sum to grand total 21280
          },
        ],
      };
      const checksInclusive = runDocumentChecks({
        document: vatInclusiveDoc,
        lineMatches: matchExtractedLines(vatInclusiveDoc.lines, sampleSupplierItems, sampleProducts),
        products: sampleProducts,
        businessToday,
      });
      expect(checksInclusive.documentFlags).not.toContain('total_mismatch');
    });

    it('flags date_implausible if delivery date is in the future or older than 60 days', () => {
      // Future date
      const futureDoc: NormalisedExtractedDocument = {
        ...baseDocument,
        deliveryDate: '2026-11-20', // future relative to 2026-11-11
      };
      const checksFuture = runDocumentChecks({
        document: futureDoc,
        lineMatches: matchExtractedLines(futureDoc.lines, sampleSupplierItems, sampleProducts),
        products: sampleProducts,
        businessToday,
      });
      expect(checksFuture.documentFlags).toContain('date_implausible');

      // Ancient date (> 60 days ago)
      const ancientDoc: NormalisedExtractedDocument = {
        ...baseDocument,
        deliveryDate: '2026-08-01',
      };
      const checksAncient = runDocumentChecks({
        document: ancientDoc,
        lineMatches: matchExtractedLines(ancientDoc.lines, sampleSupplierItems, sampleProducts),
        products: sampleProducts,
        businessToday,
      });
      expect(checksAncient.documentFlags).toContain('date_implausible');
    });

    it('flags implausible_expiry if expiry is before delivery date or > 2 years in the future', () => {
      // Expiry before delivery date
      const expiredDoc: NormalisedExtractedDocument = {
        ...baseDocument,
        deliveryDate: '2026-11-10',
        lines: [
          {
            ...baseDocument.lines[0],
            expiryDate: '2026-11-05', // 5 days BEFORE delivery
          },
        ],
      };
      const checksExpired = runDocumentChecks({
        document: expiredDoc,
        lineMatches: matchExtractedLines(expiredDoc.lines, sampleSupplierItems, sampleProducts),
        products: sampleProducts,
        businessToday,
      });
      expect(checksExpired.lineChecks[0].flags).toContain('implausible_expiry');

      // Expiry > 2 years out
      const distantDoc: NormalisedExtractedDocument = {
        ...baseDocument,
        deliveryDate: '2026-11-10',
        lines: [
          {
            ...baseDocument.lines[0],
            expiryDate: '2030-01-01', // > 3 years later
          },
        ],
      };
      const checksDistant = runDocumentChecks({
        document: distantDoc,
        lineMatches: matchExtractedLines(distantDoc.lines, sampleSupplierItems, sampleProducts),
        products: sampleProducts,
        businessToday,
      });
      expect(checksDistant.lineChecks[0].flags).toContain('implausible_expiry');
    });

    it('flags missing_expiry for tracked products with no default shelf life and no printed expiry', () => {
      const docMissingExpiry: NormalisedExtractedDocument = {
        ...baseDocument,
        lines: [
          {
            description: 'Specialty Seasonal Cold Brew Blend',
            descriptionNormalized: 'specialty seasonal cold brew blend',
            supplierSku: null,
            packCount: '5.000',
            packLabel: '1kg',
            unitPriceCents: 100000,
            lineTotalCents: 500000,
            expiryDate: null, // NO expiry printed!
            lotCode: null,
          },
        ],
      };

      // Manually simulate matching to prod-special-blend (tracksExpiry: true, shelfLifeDays: null)
      const lineMatches = [
        {
          matchMethod: 'exact' as const,
          selectedProductId: 'prod-special-blend',
          selectedSupplierItemId: null,
          packQuantity: '1000.000',
          packLabel: '1kg',
          candidates: [],
          score: 1.0,
        },
      ];

      const checks = runDocumentChecks({
        document: docMissingExpiry,
        lineMatches,
        products: sampleProducts,
        businessToday,
      });

      expect(checks.lineChecks[0].flags).toContain('missing_expiry');
    });

    it('does NOT flag missing_expiry when product has a configured shelfLifeDays (can estimate)', () => {
      // Whole milk has shelfLifeDays: 14. If expiry is missing, it will be estimated (+14 days) without a flag!
      const docMilkNoExpiry: NormalisedExtractedDocument = {
        ...baseDocument,
        lines: [
          {
            ...baseDocument.lines[0],
            expiryDate: null,
          },
        ],
      };

      const lineMatches = matchExtractedLines(docMilkNoExpiry.lines, sampleSupplierItems, sampleProducts);
      const checks = runDocumentChecks({
        document: docMilkNoExpiry,
        lineMatches,
        products: sampleProducts,
        businessToday,
      });

      expect(checks.lineChecks[0].flags).not.toContain('missing_expiry');
    });

    it('flags supplier_mismatch when header supplier differs significantly from chosen supplier', () => {
      const checks = runDocumentChecks({
        document: baseDocument, // header says "Pacific Beverage Co."
        lineMatches: matchExtractedLines(baseDocument.lines, sampleSupplierItems, sampleProducts),
        products: sampleProducts,
        chosenSupplierName: 'Manila Coffee Exchange', // completely different supplier!
        businessToday,
      });

      expect(checks.documentFlags).toContain('supplier_mismatch');
    });
  });
});


