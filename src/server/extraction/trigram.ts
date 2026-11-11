/**
 * Computes the character trigram similarity between two strings,
 * matching the exact Jaccard similarity algorithm used by PostgreSQL's `pg_trgm` extension.
 *
 * Algorithm:
 * 1. Pad string with 2 leading spaces and 1 trailing space ("  " + str + " ")
 * 2. Extract unique 3-character substrings (trigrams)
 * 3. Jaccard similarity = |Trigrams(A) ∩ Trigrams(B)| / |Trigrams(A) ∪ Trigrams(B)|
 */
export function trigramSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  if (!a && !b) return 1.0;
  if (!a || !b) return 0.0;

  const padA = `  ${a} `;
  const padB = `  ${b} `;

  const trigramsA = new Set<string>();
  for (let i = 0; i <= padA.length - 3; i++) {
    trigramsA.add(padA.slice(i, i + 3));
  }

  const trigramsB = new Set<string>();
  for (let i = 0; i <= padB.length - 3; i++) {
    trigramsB.add(padB.slice(i, i + 3));
  }

  if (trigramsA.size === 0 && trigramsB.size === 0) return 1.0;
  if (trigramsA.size === 0 || trigramsB.size === 0) return 0.0;

  let intersection = 0;
  for (const t of trigramsA) {
    if (trigramsB.has(t)) {
      intersection++;
    }
  }

  const union = trigramsA.size + trigramsB.size - intersection;
  return union === 0 ? 0.0 : intersection / union;
}


