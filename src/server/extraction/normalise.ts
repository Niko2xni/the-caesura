import Decimal from 'decimal.js';
import { normalizeText } from '@/lib/normalise';
import type { ExtractedDocument, ExtractedLine } from './schema';

export interface NormalisedExtractedLine {
  description: string;
  descriptionNormalized: string;
  supplierSku: string | null;
  packCount: string; // 3-decimal string (e.g., "1.000", "6.000")
  packLabel: string | null;
  unitPriceCents: number | null; // integer centavos, rounded half up
  lineTotalCents: number | null; // integer centavos, rounded half up
  expiryDate: string | null; // YYYY-MM-DD or null
  lotCode: string | null;
}

export interface NormalisedExtractedDocument {
  supplierName: string | null;
  supplierNameNormalized: string | null;
  documentNumber: string | null;
  deliveryDate: string | null; // YYYY-MM-DD or null
  currency: string;
  subtotalCents: number | null;
  vatAmountCents: number | null;
  totalCents: number | null;
  lines: NormalisedExtractedLine[];
}

/**
 * Converts a printed major currency number (e.g., 95.50 PHP) into integer minor units (9550 centavos).
 * Strictly uses decimal.js with ROUND_HALF_UP to avoid binary floating-point drift.
 */
export function majorUnitsToCents(amount: number | null | undefined): number | null {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return null;
  }
  return new Decimal(amount)
    .mul(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
}

/**
 * Normalises an individual transcribed receipt line:
 * - Trims verbatim strings
 * - Computes normalized text for trigram and exact catalogue matching
 * - Formats packCount as a 3-decimal string
 * - Converts prices from printed major units to integer centavos
 */
export function normaliseExtractedLine(line: ExtractedLine): NormalisedExtractedLine {
  const trimmedDesc = line.description.trim();
  const packDecimal = new Decimal(line.packCount);

  return {
    description: trimmedDesc,
    descriptionNormalized: normalizeText(trimmedDesc),
    supplierSku: line.supplierSku ? line.supplierSku.trim() || null : null,
    packCount: packDecimal.toFixed(3),
    packLabel: line.packLabel ? line.packLabel.trim() || null : null,
    unitPriceCents: majorUnitsToCents(line.unitPrice),
    lineTotalCents: majorUnitsToCents(line.lineTotal),
    expiryDate: line.expiryDate ? line.expiryDate.trim() : null,
    lotCode: line.lotCode ? line.lotCode.trim() || null : null,
  };
}

/**
 * Normalises a raw transcribed document output:
 * - Normalises supplier header and document identifiers
 * - Standardises currency to 3-letter uppercase (defaults to 'PHP')
 * - Converts monetary totals (subtotal, VAT, grand total) to integer centavos
 * - Maps lines through normaliseExtractedLine
 */
export function normaliseExtractedDocument(doc: ExtractedDocument): NormalisedExtractedDocument {
  const trimmedSupplier = doc.supplierName ? doc.supplierName.trim() || null : null;
  const currency = doc.currency ? doc.currency.trim().toUpperCase() : 'PHP';

  return {
    supplierName: trimmedSupplier,
    supplierNameNormalized: trimmedSupplier ? normalizeText(trimmedSupplier) : null,
    documentNumber: doc.documentNumber ? doc.documentNumber.trim() || null : null,
    deliveryDate: doc.deliveryDate ? doc.deliveryDate.trim() : null,
    currency: currency.length === 3 ? currency : 'PHP',
    subtotalCents: majorUnitsToCents(doc.subtotal),
    vatAmountCents: majorUnitsToCents(doc.vatAmount),
    totalCents: majorUnitsToCents(doc.total),
    lines: doc.lines.map(normaliseExtractedLine),
  };
}


