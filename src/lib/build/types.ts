/** Canonical build model — the single source of truth (see summary.md §5). */

export interface BuildSize {
  /** X extent */
  width: number;
  /** Y extent */
  height: number;
  /** Z extent */
  depth: number;
}

export interface BuildLayer {
  y: number;
  /** rows[z][x] = block id ("air" or "" treated as air). rows = Z, columns = X. Row 0 = north. */
  rows: string[][];
}

export interface Build {
  name: string;
  size: BuildSize;
  layers: BuildLayer[];
}
