import { test } from "node:test";
import assert from "node:assert/strict";

import { buildSteps, stepSummary } from "../src/lib/build/instructions.ts";
import { demoBuild } from "../src/lib/build/demo.ts";

test("steps: one per non-empty layer, bottom-up, levels 1..n", () => {
  const steps = buildSteps(demoBuild);
  assert.equal(steps.length, 4);
  assert.deepEqual(steps.map((s) => s.y), [0, 1, 2, 3]);
  assert.deepEqual(steps.map((s) => s.level), [1, 2, 3, 4]);
});

test("steps: ground layer is 25 cobblestone", () => {
  const [ground] = buildSteps(demoBuild);
  assert.equal(ground.total, 25);
  assert.deepEqual(ground.counts, [{ id: "cobblestone", count: 25 }]);
});

test("steps: layer grid keeps rows[z][x], air becomes empty string", () => {
  const s1 = buildSteps(demoBuild)[1];
  assert.equal(s1.grid[1][1], ""); // air inside the walls
  assert.equal(s1.grid[0][0], "oak_log");
  assert.equal(s1.grid[4][0], "cobblestone");
  assert.equal(s1.total, 17);
  assert.deepEqual(s1.counts, [
    { id: "oak_log", count: 14 },
    { id: "cobblestone", count: 2 },
    { id: "glass", count: 1 },
  ]);
});

test("steps: fully-air layers are skipped", () => {
  const build = {
    name: "x",
    size: { width: 1, height: 3, depth: 1 },
    layers: [
      { y: 0, rows: [["stone"]] },
      { y: 1, rows: [["air"]] },
      { y: 2, rows: [["stone"]] },
    ],
  };
  const steps = buildSteps(build);
  assert.deepEqual(steps.map((s) => s.y), [0, 2]);
  assert.deepEqual(steps.map((s) => s.level), [1, 2]);
});

test("steps: unsorted layers are ordered by y", () => {
  const build = {
    name: "x",
    size: { width: 1, height: 2, depth: 1 },
    layers: [
      { y: 1, rows: [["glass"]] },
      { y: 0, rows: [["stone"]] },
    ],
  };
  assert.deepEqual(buildSteps(build).map((s) => s.y), [0, 1]);
});

test("stepSummary formats counts descending", () => {
  const s1 = buildSteps(demoBuild)[1];
  assert.equal(stepSummary(s1), "oak_log×14, cobblestone×2, glass×1");
});