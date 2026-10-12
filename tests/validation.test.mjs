import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateLLMResponse, extractJson, MAX_DIM } from "../src/lib/build/validate.ts";

// Palette symbols used in fixtures: B=cobblestone, f=oak_planks, n=oak_log, r=glass
const HOUSE_JSON = {
  name: "Домик",
  layers: [
    {
      y: 0,
      rows: ["BBBBB", "BBBBB", "BBBBB", "BBBBB", "BBBBB"],
    },
    {
      y: 1,
      rows: ["nnnnn", "n...n", "n.r.n", "n...n", "nnnnn"],
    },
    {
      y: 2,
      rows: ["fffff", "fffff", "fffff", "fffff", "fffff"],
    },
  ],
};

test("extractJson finds JSON inside code fences and chatter", () => {
  const wrapped = 'Вот постройка:\n```json\n' + JSON.stringify(HOUSE_JSON) + "\n```\nПриятной игры!";
  assert.deepEqual(JSON.parse(extractJson(wrapped)), HOUSE_JSON);
  assert.equal(extractJson("ничего нет тут"), null);
});

test("valid symbol response produces correct build", () => {
  const res = validateLLMResponse(JSON.stringify(HOUSE_JSON));
  assert.ok(res.ok, JSON.stringify(res));
  assert.equal(res.build.size.width, 5);
  assert.equal(res.build.size.height, 3);
  assert.equal(res.build.size.depth, 5);
  assert.equal(res.build.name, "Домик");
  // y=1 row 2: "n.r.n" -> oak_log, air, glass, air, oak_log
  assert.deepEqual(res.build.layers[1].rows[2], ["oak_log", "air", "glass", "air", "oak_log"]);
});

test("legacy grid-of-names format (response_example.json) validates", () => {
  const raw = readFileSync(
    fileURLToPath(new URL("../json examples/response_example.json", import.meta.url)),
    "utf8",
  );
  const res = validateLLMResponse(raw);
  assert.ok(res.ok, JSON.stringify(res));
  assert.equal(res.build.size.width, 5);
  assert.equal(res.build.size.depth, 5);
  assert.equal(res.build.size.height, 2);
  assert.equal(res.build.layers[0].rows[0][0], "cobblestone");
  assert.equal(res.build.layers[1].rows[2][2], "glass");
});

test("unknown symbol is a hard error with coordinates", () => {
  const bad = { name: "X", layers: [{ y: 0, rows: ["BB@BB"] }] };
  const res = validateLLMResponse(JSON.stringify(bad));
  assert.ok(!res.ok);
  assert.ok(res.errors.some((e) => e.includes('"@"') && e.includes("позиция 2")));
});

test("unknown block id is a hard error", () => {
  const bad = { layers: [{ y: 0, grid: [["cobblestone", "unobtainium"]] }] };
  const res = validateLLMResponse(JSON.stringify(bad));
  assert.ok(!res.ok);
  assert.ok(res.errors.some((e) => e.includes("unobtainium")));
});

test("short rows are padded with air and warned, not rejected", () => {
  const sloppy = { layers: [{ y: 0, rows: ["BB", "B"] }] };
  const res = validateLLMResponse(JSON.stringify(sloppy));
  assert.ok(res.ok, JSON.stringify(res));
  assert.equal(res.build.size.width, 2);
  assert.equal(res.build.size.depth, 2);
  assert.deepEqual(res.build.layers[0].rows[1], ["cobblestone", "air"]);
  assert.ok(res.warnings.some((w) => w.includes("дополнены воздухом")));
});

test("duplicate y is an error", () => {
  const bad = { layers: [{ y: 0, rows: ["AA"] }, { y: 0, rows: ["AA"] }] };
  const res = validateLLMResponse(JSON.stringify(bad));
  assert.ok(!res.ok);
  assert.ok(res.errors.some((e) => e.includes("Дублирующийся слой y=0")));
});

test("gap in y is filled with air layers plus warning", () => {
  const gappy = { layers: [{ y: 0, rows: ["AA"] }, { y: 2, rows: ["AA"] }] };
  const res = validateLLMResponse(JSON.stringify(gappy));
  assert.ok(res.ok, JSON.stringify(res));
  assert.equal(res.build.size.height, 3);
  assert.ok(res.build.layers[1].rows.every((r) => r.every((id) => id === "air")));
  assert.ok(res.warnings.some((w) => w.includes("y=1")));
});

test("negative y rejected by schema", () => {
  const bad = { layers: [{ y: -1, rows: ["AA"] }] };
  const res = validateLLMResponse(JSON.stringify(bad));
  assert.ok(!res.ok);
});

test("garbage text is a clean error", () => {
  const res = validateLLMResponse("Извините, я не могу построить замок.");
  assert.ok(!res.ok);
  assert.ok(res.errors[0].includes("JSON"));
});

test("oversized build warns about the limit", () => {
  const row = "A".repeat(MAX_DIM + 1);
  const big = { layers: [{ y: 0, rows: [row] }] };
  const res = validateLLMResponse(JSON.stringify(big));
  assert.ok(res.ok);
  assert.ok(res.warnings.some((w) => w.includes("превышает")));
});
