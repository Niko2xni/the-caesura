import { describe, expect, it } from 'vitest';
import { majorUnitsToCents, normaliseExtractedDocument } from './normalise';
import { ExtractedDocumentSchema } from './schema';

describe('AI Extraction Schema & Normalisation', () => {
  const sampleValidDocument = {
    supplierName: 'Pacific Beverage Co.',
    documentNumber: 'DR-PBC-0975',
    deliveryDate: '2026-11-10',
    currency: 'PHP',
    subtotal: 3240.0,
    vatAmount: 388.8,
    total: 3628.8,
    lines: [
      {
        description: 'Barista Whole Milk 1L Tetra Pak',
        supplierSku: 'PBC-MILK-1L',
        packCount: 12,
        packLabel: '1L Carton',
        unitPrice: 95.0,
        lineTotal: 1140.0,
        expiryDate: '2026-11-24',
        lotCode: 'LOT-MILK-02',
      },
      {
        description: 'Oatly Barista Edition 1L (Case of 6)',
        supplierSku: 'PBC-OAT-CASE6',
        packCount: 3,
        packLabel: 'Case (6x1L)',
        unitPrice: 1080.0,
        lineTotal: 3240.0,
        expiryDate: '2027-05-10',
        lotCode: 'LOT-OAT-150D',
      },
    ],
  };

  describe('ExtractedDocumentSchema (Zod 4)', () => {
    it('validates a complete Philippine delivery receipt successfully', () => {
      const parsed = ExtractedDocumentSchema.safeParse(sampleValidDocument);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.lines).toHaveLength(2);
        expect(parsed.data.lines[0].description).toBe('Barista Whole Milk 1L Tetra Pak');
        expect(parsed.data.lines[0].packCount).toBe(12);
      }
    });

    it('accepts documents with nullable prices and dates', () => {
      const minimalDoc = {
        supplierName: null,
        documentNumber: null,
        deliveryDate: null,
        currency: null,
        subtotal: null,
        vatAmount: null,
        total: null,
        lines: [
          {
            description: 'Local Roasted Beans 1kg',
            supplierSku: null,
            packCount: 5,
            packLabel: null,
            unitPrice: null,
            lineTotal: null,
            expiryDate: null,
            lotCode: null,
          },
        ],
      };

      const parsed = ExtractedDocumentSchema.safeParse(minimalDoc);
      expect(parsed.success).toBe(true);
    });

    it('rejects documents with empty lines array', () => {
      const emptyLinesDoc = {
        ...sampleValidDocument,
        lines: [],
      };

      const parsed = ExtractedDocumentSchema.safeParse(emptyLinesDoc);
      expect(parsed.success).toBe(false);
    });

    it('rejects invalid ISO dates', () => {
      const invalidDateDoc = {
        ...sampleValidDocument,
        deliveryDate: '2026-13-45', // invalid month and day
      };

      const parsed = ExtractedDocumentSchema.safeParse(invalidDateDoc);
      expect(parsed.success).toBe(false);
    });

    it('rejects zero or negative pack counts', () => {
      const zeroPackDoc = {
        ...sampleValidDocument,
        lines: [
          {
            ...sampleValidDocument.lines[0],
            packCount: 0,
          },
        ],
      };

      const parsed = ExtractedDocumentSchema.safeParse(zeroPackDoc);
      expect(parsed.success).toBe(false);
    });

    it('rejects negative prices', () => {
      const negativePriceDoc = {
        ...sampleValidDocument,
        lines: [
          {
            ...sampleValidDocument.lines[0],
            unitPrice: -50.0,
          },
        ],
      };

      const parsed = ExtractedDocumentSchema.safeParse(negativePriceDoc);
      expect(parsed.success).toBe(false);
    });
  });

  describe('majorUnitsToCents (decimal.js centavos conversion)', () => {
    it('converts major currency numbers to integer centavos', () => {
      expect(majorUnitsToCents(95.5)).toBe(9550);
      expect(majorUnitsToCents(1100.0)).toBe(110000);
      expect(majorUnitsToCents(0.05)).toBe(5);
      expect(majorUnitsToCents(0)).toBe(0);
    });

    it('rounds half-up to the nearest minor unit', () => {
      expect(majorUnitsToCents(10.555)).toBe(1056);
      expect(majorUnitsToCents(10.554)).toBe(1055);
    });

    it('safely handles null and undefined', () => {
      expect(majorUnitsToCents(null)).toBeNull();
      expect(majorUnitsToCents(undefined)).toBeNull();
    });
  });

  describe('normaliseExtractedDocument', () => {
    it('normalises document headers, prices, and lines cleanly', () => {
      const parsed = ExtractedDocumentSchema.parse(sampleValidDocument);
      const normalised = normaliseExtractedDocument(parsed);

      expect(normalised.supplierName).toBe('Pacific Beverage Co.');
      expect(normalised.supplierNameNormalized).toBe('pacific beverage co');
      expect(normalised.currency).toBe('PHP');
      expect(normalised.subtotalCents).toBe(324000); // 3240.00 -> 324000 centavos
      expect(normalised.vatAmountCents).toBe(38880); // 388.80 -> 38880 centavos
      expect(normalised.totalCents).toBe(362880); // 3628.80 -> 362880 centavos

      expect(normalised.lines).toHaveLength(2);

      const firstLine = normalised.lines[0];
      expect(firstLine.description).toBe('Barista Whole Milk 1L Tetra Pak');
      expect(firstLine.descriptionNormalized).toBe('barista whole milk 1l tetra pak');
      expect(firstLine.packCount).toBe('12.000');
      expect(firstLine.unitPriceCents).toBe(9500); // ₱95.00 -> 9500 centavos
      expect(firstLine.lineTotalCents).toBe(114000); // ₱1,140.00 -> 114000 centavos
      expect(firstLine.expiryDate).toBe('2026-11-24');
      expect(firstLine.lotCode).toBe('LOT-MILK-02');
    });

    it('defaults missing or invalid currency to PHP', () => {
      const noCurrencyDoc = ExtractedDocumentSchema.parse({
        ...sampleValidDocument,
        currency: null,
      });

      const normalised = normaliseExtractedDocument(noCurrencyDoc);
      expect(normalised.currency).toBe('PHP');
    });
  });
});


