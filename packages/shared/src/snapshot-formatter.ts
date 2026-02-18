/**
 * Formats a SnapshotNode tree into the compact text representation.
 */
import type { SnapshotNode } from './types/snapshot.js';

/** Format a snapshot tree into compact text */
export function formatSnapshot(node: SnapshotNode, indent: number = 0): string {
  const lines: string[] = [];
  formatNode(node, indent, lines);
  return lines.join('\n');
}

function formatNode(
  node: SnapshotNode,
  indent: number,
  lines: string[]
): void {
  const pad = '  '.repeat(indent);
  let line = `${pad}[`;

  if (node.ref) {
    line += `${node.ref} `;
  }

  line += node.role;

  if (node.name) {
    line += ` "${node.name}"`;
  }

  line += ']';

  if (node.value !== undefined) {
    line += ` ${node.value}`;
  }

  if (node.checked !== undefined) {
    line += node.checked ? ' (checked)' : ' (unchecked)';
  }

  if (node.disabled) {
    line += ' (disabled)';
  }

  lines.push(line);

  if (node.children) {
    for (const child of node.children) {
      formatNode(child, indent + 1, lines);
    }
  }
}

/**
 * Estimate the token count for a string.
 * Rough approximation: ~4 chars per token for English text.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
