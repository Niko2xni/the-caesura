import { trigramSimilarity } from '../src/server/extraction/trigram';
import type { NormalisedExtractedDocument } from '../src/server/extraction/normalise';
import type { FixtureExpected } from './generate-fixtures';

export interface MatchedLineInfo {
  matchMethod: string;
  selectedSku: string | null;
  score: number;
}

export interface FixtureEvaluationResult {
  fixtureId: string;
  category: string;
  description: string;
  durationMs: number;
  tokens: { prompt: number; completion: number };
  supplierMatch: boolean;
  dateExact: boolean;
  referenceExact: boolean;
  lineCountExpected: number;
  lineCountExtracted: number;
  packCountAccuracy: number;
  priceAccuracy: number;
  expiryAccuracy: number;
  finalSkuAccuracy: number;
  negativeTestPassed?: boolean;
  passed: boolean;
  notes: string[];
}

export function evaluateExtraction(opts: {
  expected: FixtureExpected;
  extracted: NormalisedExtractedDocument | null;
  matchedLines: MatchedLineInfo[];
  durationMs: number;
  tokens: { prompt: number; completion: number };
}): FixtureEvaluationResult {
  const { expected, extracted, matchedLines, durationMs, tokens } = opts;
  const notes: string[] = [];

  // Negative test case handling
  if (expected.isNegativeTest) {
    const isCleanZero = !extracted || extracted.lines.length === 0;
    const negativeTestPassed = isCleanZero;
    if (negativeTestPassed) {
      notes.push('Correctly identified non-receipt / returned 0 lines without phantom records.');
    } else {
      notes.push(`Hallucinated ${extracted?.lines.length ?? 0} lines from non-receipt image.`);
    }

    return {
      fixtureId: expected.fixtureId,
      category: expected.category,
      description: expected.description,
      durationMs,
      tokens,
      supplierMatch: true,
      dateExact: true,
      referenceExact: true,
      lineCountExpected: 0,
      lineCountExtracted: extracted?.lines.length ?? 0,
      packCountAccuracy: negativeTestPassed ? 1.0 : 0.0,
      priceAccuracy: negativeTestPassed ? 1.0 : 0.0,
      expiryAccuracy: negativeTestPassed ? 1.0 : 0.0,
      finalSkuAccuracy: negativeTestPassed ? 1.0 : 0.0,
      negativeTestPassed,
      passed: negativeTestPassed,
      notes,
    };
  }

  if (!extracted) {
    return {
      fixtureId: expected.fixtureId,
      category: expected.category,
      description: expected.description,
      durationMs,
      tokens,
      supplierMatch: false,
      dateExact: false,
      referenceExact: false,
      lineCountExpected: expected.lines.length,
      lineCountExtracted: 0,
      packCountAccuracy: 0,
      priceAccuracy: 0,
      expiryAccuracy: 0,
      finalSkuAccuracy: 0,
      passed: false,
      notes: ['Extraction returned null or failed.'],
    };
  }

  // 1. Supplier match evaluation
  let supplierMatch = false;
  if (!expected.expectedSupplierName) {
    supplierMatch = true;
  } else if (extracted.supplierName) {
    const normExtracted = extracted.supplierName.toLowerCase();
    const normExpected = expected.expectedSupplierName.toLowerCase();
    const sim = trigramSimilarity(normExtracted, normExpected);
    supplierMatch = normExtracted.includes(normExpected) || normExpected.includes(normExtracted) || sim >= 0.45;
  }
  if (!supplierMatch) {
    notes.push(`Supplier mismatch: expected "${expected.expectedSupplierName}", got "${extracted.supplierName ?? 'null'}"`);
  }

  // 2. Date evaluation
  const dateExact = !expected.expectedDeliveryDate || extracted.deliveryDate === expected.expectedDeliveryDate;
  if (!dateExact) {
    notes.push(`Date mismatch: expected "${expected.expectedDeliveryDate}", got "${extracted.deliveryDate ?? 'null'}"`);
  }

  // 3. Reference evaluation
  const referenceExact =
    !expected.expectedReference ||
    extracted.documentNumber?.toLowerCase() === expected.expectedReference.toLowerCase();

  // 4. Per-line metrics
  let matchedPackCounts = 0;
  let matchedPrices = 0;
  let matchedExpiries = 0;
  let matchedSkus = 0;

  for (let i = 0; i < expected.lines.length; i++) {
    const expLine = expected.lines[i];
    const extLine = extracted.lines[i];
    const matchedLine = matchedLines[i];

    if (!extLine) {
      continue;
    }

    // Pack count
    const extPackCount = Math.round(Number(extLine.packCount));
    if (extPackCount === expLine.packCount) {
      matchedPackCounts++;
    } else {
      notes.push(`Line ${i + 1} pack count: expected ${expLine.packCount}, got ${extLine.packCount}`);
    }

    // Price
    const extLineCost = extLine.lineTotalCents;
    if (expLine.lineCostCents === null) {
      if (extLineCost === null || extLineCost === 0) {
        matchedPrices++;
      }
    } else if (extLineCost !== null) {
      // Tolerate within 100 cents (1 PHP rounding tolerance for VAT inclusion)
      if (Math.abs(extLineCost - expLine.lineCostCents) <= 100) {
        matchedPrices++;
      } else {
        notes.push(`Line ${i + 1} price: expected ${expLine.lineCostCents}¢, got ${extLineCost}¢`);
      }
    }

    // Expiry
    if (expLine.expiryDate === null) {
      if (!extLine.expiryDate) {
        matchedExpiries++;
      }
    } else if (extLine.expiryDate === expLine.expiryDate) {
      matchedExpiries++;
    } else {
      notes.push(`Line ${i + 1} expiry: expected ${expLine.expiryDate}, got ${extLine.expiryDate ?? 'null'}`);
    }

    // Product SKU match
    if (matchedLine && matchedLine.selectedSku === expLine.expectedSku) {
      matchedSkus++;
    } else {
      notes.push(`Line ${i + 1} SKU: expected "${expLine.expectedSku}", got "${matchedLine?.selectedSku ?? 'unmatched'}"`);
    }
  }

  const denom = expected.lines.length || 1;
  const packCountAccuracy = matchedPackCounts / denom;
  const priceAccuracy = matchedPrices / denom;
  const expiryAccuracy = matchedExpiries / denom;
  const finalSkuAccuracy = matchedSkus / denom;

  // Passed if SKU accuracy >= 0.8 and supplierMatch is true
  const passed = supplierMatch && finalSkuAccuracy >= 0.75 && packCountAccuracy >= 0.75;

  return {
    fixtureId: expected.fixtureId,
    category: expected.category,
    description: expected.description,
    durationMs,
    tokens,
    supplierMatch,
    dateExact,
    referenceExact,
    lineCountExpected: expected.lines.length,
    lineCountExtracted: extracted.lines.length,
    packCountAccuracy,
    priceAccuracy,
    expiryAccuracy,
    finalSkuAccuracy,
    passed,
    notes,
  };
}
