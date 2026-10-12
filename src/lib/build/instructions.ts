import type { Build } from "./types";

/**
 * Step-by-step building instruction: one step per non-empty layer, bottom-up.
 * A builder in Minecraft places one layer, climbs, places the next — so steps
 * mirror that: grid preview + block counts per layer.
 */
export interface Step {
  /** 1-based build level (bottom layer = 1). */
  level: number;
  /** Absolute layer y (matches Build.layers[].y). */
  y: number;
  /** Layer grid, rows[z][x]; "" = air. */
  grid: string[][];
  /** Non-air blocks in the layer. */
  total: number;
  /** Per-block counts, sorted by count desc, then id. */
  counts: { id: string; count: number }[];
}

/** Builds instruction steps from a canonical Build. Pure and test-friendly. */
export function buildSteps(build: Build): Step[] {
  const steps: Step[] = [];
  const layers = [...build.layers].sort((a, b) => a.y - b.y);
  for (const layer of layers) {
    const counts = new Map<string, number>();
    const grid = layer.rows.map((row) =>
      row.map((id) => {
        if (!id || id === "air") return "";
        counts.set(id, (counts.get(id) ?? 0) + 1);
        return id;
      }),
    );
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    if (total === 0) continue; // all-air layer (validator padding) — nothing to place
    steps.push({
      level: steps.length + 1,
      y: layer.y,
      grid,
      total,
      counts: [...counts.entries()]
        .map(([id, count]) => ({ id, count }))
        .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id)),
    });
  }
  return steps;
}

/** Compact materials line for a step: "oak_log×14, glass×1". */
export function stepSummary(step: Step): string {
  return step.counts.map(({ id, count }) => `${id}×${count}`).join(", ");
}