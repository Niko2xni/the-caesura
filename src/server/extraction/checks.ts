import Decimal from 'decimal.js';
import { daysBetween, getBusinessToday } from '@/lib/dates';
import { normalizeText } from '@/lib/normalise';
import type { LineMatchResult, ProductCandidate } from './match';
import type { NormalisedExtractedDocument, NormalisedExtractedLine } from './normalise';
import { trigramSimilarity } from './trigram';

export type LineCheckFlag =
  | 'unmatched'
  | 'weak_match'
  | 'pack_unknown'
  | 'arithmetic_mismatch'
  | 'missing_expiry'
  | 'implausible_expiry';

export type DocumentCheckFlag =
  | 'total_mismatch'
  | 'date_implausible'
  | 'supplier_mismatch';

export interface LineCheckResult {
  flags: LineCheckFlag[];
}

export interface DocumentCheckResult {
  documentFlags: DocumentCheckFlag[];
  lineChecks: LineCheckResult[];
}

export interface RunChecksInput {
  document: NormalisedExtractedDocument;
  lineMatches: LineMatchResult[];
  products: ProductCandidate[];
  chosenSupplierName?: string | null;
  businessToday?: string; // defaults to getBusinessToday()
}

/**
 * Pure, deterministic verification engine for extracted documents.
 * Strictly adheres to docs/architecture.md §5:
 *
 * Line flags:
 * - 'unmatched': No catalogue match found
 * - 'weak_match': Weak candidate found (score 0.4 - 0.6), requires confirmation
 * - 'pack_unknown': Matched product lacks known pack quantity conversion
 * - 'arithmetic_mismatch': packCount * unitPrice differs from lineTotal by > 1 centavo
 * - 'missing_expiry': Tracked product, no expiry printed, and shelf_life_days is null
 * - 'implausible_expiry': Expiry is before delivery date or > 2 years (730 days) after
 *
 * Document flags:
 * - 'total_mismatch': Sum of line totals matches neither subtotal nor total within 1 centavo
 * - 'date_implausible': Delivery date is in the future or older than 60 days
 * - 'supplier_mismatch': Extracted supplier name vs chosen supplier similarity < 0.5
 *
 * No database or network access (Rule 66).
 */
export function runDocumentChecks(input: RunChecksInput): DocumentCheckResult {
  const { document, lineMatches, products, chosenSupplierName } = input;
  const today = input.businessToday || getBusinessToday();
  const prodMap = new Map(products.map((p) => [p.id, p]));

  const documentFlags: DocumentCheckFlag[] = [];

  // 1. Document temporal plausibility check
  if (document.deliveryDate) {
    const diffFromToday = daysBetween(today, document.deliveryDate);
    // Future date (diff > 0) or older than 60 days (diff < -60)
    if (diffFromToday > 0 || diffFromToday < -60) {
      documentFlags.push('date_implausible');
    }
  }

  // 2. Supplier header mismatch check
  if (document.supplierName && chosenSupplierName) {
    const sim = trigramSimilarity(
      normalizeText(document.supplierName),
      normalizeText(chosenSupplierName),
    );
    if (sim < 0.5) {
      documentFlags.push('supplier_mismatch');
    }
  }

  // 3. Line-level checks
  const lineChecks: LineCheckResult[] = [];
  const referenceDate = document.deliveryDate || today;

  for (let i = 0; i < document.lines.length; i++) {
    const line = document.lines[i];
    const match = lineMatches[i];
    const flags: LineCheckFlag[] = [];

    // Match status flags
    if (!match || match.selectedProductId === null) {
      if (match && match.candidates.length > 0) {
        flags.push('weak_match');
      } else {
        flags.push('unmatched');
      }
    } else {
      // Product is selected: check pack quantity
      if (match.packQuantity === null) {
        flags.push('pack_unknown');
      }

      // Check expiry tracking policy
      const matchedProd = prodMap.get(match.selectedProductId);
      if (matchedProd && matchedProd.tracksExpiry) {
        if (!line.expiryDate && matchedProd.shelfLifeDays === null) {
          flags.push('missing_expiry');
        }
      }
    }

    // Arithmetic check: packCount * unitPrice == lineTotal
    if (line.unitPriceCents !== null && line.lineTotalCents !== null) {
      try {
        const packs = new Decimal(line.packCount);
        const expectedTotal = packs
          .mul(line.unitPriceCents)
          .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
          .toNumber();

        const diff = Math.abs(expectedTotal - line.lineTotalCents);
        if (diff > 1) {
          flags.push('arithmetic_mismatch');
        }
      } catch {
        flags.push('arithmetic_mismatch');
      }
    }

    // Expiry date plausibility check
    if (line.expiryDate) {
      const diffFromDelivery = daysBetween(referenceDate, line.expiryDate);
      // Strictly before delivery date or more than 2 years (730 days) in future
      if (diffFromDelivery < 0 || diffFromDelivery > 730) {
        flags.push('implausible_expiry');
      }
    }

    lineChecks.push({ flags });
  }

  // 4. Document total mismatch check (accepts VAT-inclusive or VAT-exclusive pricing)
  if (document.totalCents !== null || document.subtotalCents !== null) {
    const allLinesHaveTotals = document.lines.length > 0 && document.lines.every((l) => l.lineTotalCents !== null);

    if (allLinesHaveTotals) {
      const sumOfLines = document.lines.reduce((sum, l) => sum + (l.lineTotalCents ?? 0), 0);

      const matchesGrandTotal =
        document.totalCents !== null && Math.abs(sumOfLines - document.totalCents) <= 1;

      const matchesSubtotal =
        document.subtotalCents !== null && Math.abs(sumOfLines - document.subtotalCents) <= 1;

      if (!matchesGrandTotal && !matchesSubtotal) {
        documentFlags.push('total_mismatch');
      }
    }
  }

  return {
    documentFlags,
    lineChecks,
  };
}


