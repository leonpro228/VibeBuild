import type { Build } from "./types";

/** Demo build used until the LLM pipeline is wired in (roadmap step 4). */
export const demoBuild: Build = {
  name: "Маленький средневековый домик",
  size: { width: 5, height: 4, depth: 5 },
  layers: [
    {
      y: 0,
      rows: [
        ["cobblestone", "cobblestone", "cobblestone", "cobblestone", "cobblestone"],
        ["cobblestone", "cobblestone", "cobblestone", "cobblestone", "cobblestone"],
        ["cobblestone", "cobblestone", "cobblestone", "cobblestone", "cobblestone"],
        ["cobblestone", "cobblestone", "cobblestone", "cobblestone", "cobblestone"],
        ["cobblestone", "cobblestone", "cobblestone", "cobblestone", "cobblestone"],
      ],
    },
    {
      y: 1,
      rows: [
        ["oak_log", "oak_log", "oak_log", "oak_log", "oak_log"],
        ["oak_log", "air", "air", "air", "oak_log"],
        ["oak_log", "air", "glass", "air", "oak_log"],
        ["oak_log", "air", "air", "air", "oak_log"],
        ["cobblestone", "oak_log", "oak_log", "oak_log", "cobblestone"],
      ],
    },
    {
      y: 2,
      rows: [
        ["oak_log", "oak_log", "oak_log", "oak_log", "oak_log"],
        ["oak_log", "air", "glass", "air", "oak_log"],
        ["oak_log", "air", "air", "air", "oak_log"],
        ["oak_log", "air", "glass", "air", "oak_log"],
        ["cobblestone", "oak_log", "oak_log", "oak_log", "cobblestone"],
      ],
    },
    {
      y: 3,
      rows: [
        ["oak_planks", "oak_planks", "oak_planks", "oak_planks", "oak_planks"],
        ["oak_planks", "oak_planks", "oak_planks", "oak_planks", "oak_planks"],
        ["oak_planks", "oak_planks", "oak_planks", "oak_planks", "oak_planks"],
        ["oak_planks", "oak_planks", "oak_planks", "oak_planks", "oak_planks"],
        ["oak_planks", "oak_planks", "oak_planks", "oak_planks", "oak_planks"],
      ],
    },
  ],
};

/** Bill of materials: block id -> count, sorted by count descending. */
export function materials(build: Build): { id: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const layer of build.layers) {
    for (const row of layer.rows) {
      for (const id of row) {
        if (!id || id === "air") continue;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count);
}
