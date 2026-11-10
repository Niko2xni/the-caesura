/**
 * Normalizes item names and descriptions for matching:
 * - Lowercases text
 * - Strips punctuation (keeping alphanumeric characters and spaces)
 * - Collapses consecutive whitespace into a single space
 * - Trims leading and trailing whitespace
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

