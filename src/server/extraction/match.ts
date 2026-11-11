import type { NormalisedExtractedLine } from './normalise';
import { trigramSimilarity } from './trigram';

export interface SupplierItemCandidate {
  id: string; // supplier_items.id
  supplierId: string;
  productId: string;
  productName: string;
  supplierSku: string | null;
  description: string;
  descriptionNormalized: string;
  packLabel: string;
  packQuantity: string;
  lastPackCostCents: number | null;
}

export interface ProductCandidate {
  id: string;
  name: string;
  nameNormalized: string;
  sku: string;
  baseUnit: string;
  tracksExpiry: boolean;
  shelfLifeDays: number | null;
}

export interface MatchCandidate {
  productId: string;
  productName: string;
  supplierItemId: string | null;
  supplierSku: string | null;
  description: string;
  packQuantity: string | null;
  packLabel: string | null;
  score: number;
  source: 'supplier_item' | 'product';
}

export type MatchMethod = 'exact' | 'suggested' | 'manual' | 'new_item';

export interface LineMatchResult {
  matchMethod: MatchMethod;
  selectedProductId: string | null;
  selectedSupplierItemId: string | null;
  packQuantity: string | null;
  packLabel: string | null;
  candidates: MatchCandidate[];
  score: number;
}

const THRESHOLD_SUGGESTED = 0.6;
const THRESHOLD_WEAK = 0.4;

/**
 * Pure matching function for an individual extracted receipt line against catalogue items.
 * Strictly adheres to docs/architecture.md §4:
 * 1. exact supplier_sku for chosen supplier, then exact description_normalized: 'exact'
 * 2. trigram similarity against supplier items >= 0.6: 'suggested' (auto-select top, up to 3 candidates)
 * 3. trigram similarity against products.name_normalized >= 0.4: weak candidate (not auto-selected)
 * 4. otherwise: 'unmatched'
 *
 * No database or network access (Rule 66).
 */
export function matchExtractedLine(
  line: NormalisedExtractedLine,
  supplierItems: SupplierItemCandidate[],
  products: ProductCandidate[],
): LineMatchResult {
  // 1a. Exact match by supplier SKU
  if (line.supplierSku) {
    const targetSku = line.supplierSku.trim().toLowerCase();
    const skuMatch = supplierItems.find((item) => item.supplierSku && item.supplierSku.trim().toLowerCase() === targetSku);

    if (skuMatch) {
      const candidate: MatchCandidate = {
        productId: skuMatch.productId,
        productName: skuMatch.productName,
        supplierItemId: skuMatch.id,
        supplierSku: skuMatch.supplierSku,
        description: skuMatch.description,
        packQuantity: skuMatch.packQuantity,
        packLabel: skuMatch.packLabel,
        score: 1.0,
        source: 'supplier_item',
      };

      return {
        matchMethod: 'exact',
        selectedProductId: skuMatch.productId,
        selectedSupplierItemId: skuMatch.id,
        packQuantity: skuMatch.packQuantity,
        packLabel: skuMatch.packLabel,
        candidates: [candidate],
        score: 1.0,
      };
    }
  }

  // 1b. Exact match by normalized description on supplier items
  const descMatch = supplierItems.find(
    (item) => item.descriptionNormalized === line.descriptionNormalized,
  );

  if (descMatch) {
    const candidate: MatchCandidate = {
      productId: descMatch.productId,
      productName: descMatch.productName,
      supplierItemId: descMatch.id,
      supplierSku: descMatch.supplierSku,
      description: descMatch.description,
      packQuantity: descMatch.packQuantity,
      packLabel: descMatch.packLabel,
      score: 1.0,
      source: 'supplier_item',
    };

    return {
      matchMethod: 'exact',
      selectedProductId: descMatch.productId,
      selectedSupplierItemId: descMatch.id,
      packQuantity: descMatch.packQuantity,
      packLabel: descMatch.packLabel,
      candidates: [candidate],
      score: 1.0,
    };
  }

  // 2. Trigram similarity against supplier items (threshold >= 0.6)
  const scoredSupplierItems = supplierItems
    .map((item) => ({
      item,
      score: trigramSimilarity(line.descriptionNormalized, item.descriptionNormalized),
    }))
    .filter(({ score }) => score >= THRESHOLD_SUGGESTED)
    .sort((a, b) => b.score - a.score);

  if (scoredSupplierItems.length > 0) {
    const top = scoredSupplierItems[0];
    const topCandidates: MatchCandidate[] = scoredSupplierItems.slice(0, 3).map(({ item, score }) => ({
      productId: item.productId,
      productName: item.productName,
      supplierItemId: item.id,
      supplierSku: item.supplierSku,
      description: item.description,
      packQuantity: item.packQuantity,
      packLabel: item.packLabel,
      score,
      source: 'supplier_item',
    }));

    return {
      matchMethod: 'suggested',
      selectedProductId: top.item.productId,
      selectedSupplierItemId: top.item.id,
      packQuantity: top.item.packQuantity,
      packLabel: top.item.packLabel,
      candidates: topCandidates,
      score: top.score,
    };
  }

  // 3. Trigram similarity against products.name_normalized (threshold >= 0.4)
  const scoredProducts = products
    .map((prod) => ({
      prod,
      score: trigramSimilarity(line.descriptionNormalized, prod.nameNormalized),
    }))
    .filter(({ score }) => score >= THRESHOLD_WEAK)
    .sort((a, b) => b.score - a.score);

  if (scoredProducts.length > 0) {
    const topCandidates: MatchCandidate[] = scoredProducts.slice(0, 3).map(({ prod, score }) => ({
      productId: prod.id,
      productName: prod.name,
      supplierItemId: null,
      supplierSku: null,
      description: prod.name,
      packQuantity: null,
      packLabel: null,
      score,
      source: 'product',
    }));

    return {
      matchMethod: 'manual', // weak candidate, NOT auto-selected
      selectedProductId: null,
      selectedSupplierItemId: null,
      packQuantity: null,
      packLabel: null,
      candidates: topCandidates,
      score: scoredProducts[0].score,
    };
  }

  // 4. Otherwise: unmatched
  return {
    matchMethod: 'manual',
    selectedProductId: null,
    selectedSupplierItemId: null,
    packQuantity: null,
    packLabel: null,
    candidates: [],
    score: 0.0,
  };
}

/**
 * Matches an array of normalized extracted lines against catalogue candidates.
 */
export function matchExtractedLines(
  lines: NormalisedExtractedLine[],
  supplierItems: SupplierItemCandidate[],
  products: ProductCandidate[],
): LineMatchResult[] {
  return lines.map((line) => matchExtractedLine(line, supplierItems, products));
}


