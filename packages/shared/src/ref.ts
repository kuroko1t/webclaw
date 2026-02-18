/**
 * @ref encoding utilities for compact snapshot element references.
 *
 * Each interactive element in a snapshot is assigned a unique @ref like @e1, @e2, etc.
 * Refs are scoped to a single snapshot and reset on each new snapshot.
 */

const REF_PREFIX = '@e';
const REF_PATTERN = /^@e(\d+)$/;

/** Generate a ref string from a numeric index (1-based) */
export function encodeRef(index: number): string {
  if (index < 1) {
    throw new Error(`Ref index must be >= 1, got ${index}`);
  }
  return `${REF_PREFIX}${index}`;
}

/** Extract the numeric index from a ref string, or null if invalid */
export function decodeRef(ref: string): number | null {
  const match = ref.match(REF_PATTERN);
  if (!match) return null;
  return parseInt(match[1], 10);
}

/** Check if a string is a valid @ref */
export function isValidRef(ref: string): boolean {
  return REF_PATTERN.test(ref);
}

/** Create a ref counter for generating sequential refs within a snapshot */
export function createRefCounter(): { next(): string; count(): number } {
  let counter = 0;
  return {
    next() {
      counter++;
      return encodeRef(counter);
    },
    count() {
      return counter;
    },
  };
}
