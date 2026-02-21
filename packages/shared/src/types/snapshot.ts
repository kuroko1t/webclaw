/**
 * Compact A11y tree snapshot types with @ref support.
 */

/** A node in the compact snapshot tree */
export interface SnapshotNode {
  role: string;
  name?: string;
  ref?: string;
  value?: string;
  checked?: boolean;
  selected?: boolean;
  disabled?: boolean;
  expanded?: boolean;
  pressed?: boolean;
  children?: SnapshotNode[];
}

/** Complete page snapshot */
export interface PageSnapshot {
  snapshotId: string;
  url: string;
  title: string;
  tree: SnapshotNode;
  timestamp: number;
}

/** Options for snapshot generation */
export interface SnapshotOptions {
  /** Maximum token budget for the snapshot text (default: 4000) */
  maxTokens?: number;
  /** Include only interactive elements */
  interactiveOnly?: boolean;
  /** Focus on a specific landmark region (e.g., 'main', 'nav', 'contentinfo', 'complementary') */
  focusRegion?: string;
}
