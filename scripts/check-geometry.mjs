/**
 * Headless sanity check of voxel geometry construction (no browser needed).
 * Run: node scripts/check-geometry.mjs
 */
import { buildGeometry, flattenGrid } from "../src/lib/render/voxelGeometry.ts";
import { INFO_BY_ID } from "../src/lib/palette/palette.ts";
import { demoBuild } from "../src/lib/build/demo.ts";

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

// 1. Grid flattening: expected cell count = 25 + 16*2? compute: y0 25, y1 walls 16+glass+edges...
const grid = flattenGrid(demoBuild);
const expectedCells = demoBuild.layers.reduce(
  (acc, l) => acc + l.rows.flat().filter((id) => id && id !== "air").length,
  0,
);
if (grid.size !== expectedCells) fail(`grid size ${grid.size} != ${expectedCells}`);
console.log(`grid cells: ${grid.size}`);

// 2. Geometry validity for both material classes.
for (const transparent of [false, true]) {
  const geo = buildGeometry(demoBuild, transparent);
  const pos = geo.getAttribute("position");
  const uv = geo.getAttribute("uv");
  const nrm = geo.getAttribute("normal");
  const idx = geo.getIndex();
  if (!pos || !uv || !nrm || !idx) fail("missing attributes");
  if (pos.count !== uv.count || pos.count !== nrm.count) fail("attribute count mismatch");
  if (idx.count % 6 !== 0) fail("index count not a multiple of 6 (quad layout)");
  for (let i = 0; i < pos.count; i++) {
    if (!Number.isFinite(pos.getX(i)) || !Number.isFinite(pos.getY(i)) || !Number.isFinite(pos.getZ(i)))
      fail(`NaN position at ${i}`);
  }
  // UVs must stay inside [0,1]
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    if (u < -1e-6 || u > 1 + 1e-6 || v < -1e-6 || v > 1 + 1e-6) fail(`uv out of range: ${u},${v}`);
  }
  console.log(
    `${transparent ? "transparent" : "opaque"}: ${pos.count / 4} faces, ${idx.count / 3} triangles`,
  );
  if (transparent && pos.count === 0) fail("no transparent faces (glass should be visible)");
  geo.dispose();
}

// 3. Culling spot checks:
// bottom layer full 5x5 cobblestone: top faces visible (25), side outer faces 16, bottom faces 25.
// interior vertical faces must be culled: opaque face count should equal 25+25+16 + wall contributions.
const opaqueGeo = buildGeometry(demoBuild, false);
const opaqueFaces = opaqueGeo.getAttribute("position").count / 4;
// Upper bound sanity: full voxelization without culling would be 82 cells * 6 = 492
if (opaqueFaces >= 82 * 6) fail("culling not applied");
console.log(`culling applied: ${opaqueFaces} faces < ${82 * 6} unculled`);

// 4. Every demo block exists in the palette catalog.
for (const id of new Set([...grid.values()])) {
  if (!INFO_BY_ID.has(id)) fail(`demo block not in palette: ${id}`);
}
console.log("all demo blocks present in palette");

// 5. Focus-mode slice regression: faces opening into hidden layers above must
// be drawn (exposedAbove), otherwise the focused layer looks "eaten" where
// hidden walls sit on top of it.
const focusGeo = buildGeometry(demoBuild, false, { y: (y) => y === 0, exposedAbove: 1 });
const focusFaces = focusGeo.getAttribute("position").count / 4;
// 5×5 dirt floor: 25 top + 25 bottom + 20 outward sides = 70.
if (focusFaces !== 70) {
  fail(`focus slice y=0: ${focusFaces} faces, expected 70 (hidden neighbors must expose faces)`);
}
const plainGeo = buildGeometry(demoBuild, false, { y: (y) => y === 0 });
const plainFaces = plainGeo.getAttribute("position").count / 4;
if (plainFaces >= focusFaces) fail("exposedAbove had no effect on face culling");
console.log(`focus slice: ${focusFaces} faces (with exposedAbove), ${plainFaces} without`);
focusGeo.dispose();
plainGeo.dispose();

console.log("geometry checks OK");
