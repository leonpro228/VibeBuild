/**
 * Build-time pipeline: raw Minecraft asset JSONs -> compact runtime catalog + texture atlas.
 *
 * Input  (json assets/): blocks_states.json, blocks_models.json (vanilla 26.1),
 *                        texture_content.json (flat fallback), blocks/*.png (per-face,
 *                        fetched by scripts/fetch-textures.mjs)
 * Output (src/assets/):  palette.json, atlas.png
 *
 * Per-face pipeline: blockstate -> model -> parent chain gives {up, down, north,
 * south, east, west} -> texture name; every referenced texture becomes one 16x16
 * tile in the atlas (animated textures: first frame; grayscale biome textures:
 * baked tint from TINTS). Blocks whose model chain can't be resolved fall back
 * to the flat texture_content texture on all faces. `.` stays reserved for air.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

import { SYMBOLS, TINTS, TRANSPARENT, WHITELIST } from "./palette-config.mjs";
import { resolveBlockFaces } from "./model-faces.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ASSETS_IN = join(ROOT, "json assets");
const ASSETS_OUT = join(ROOT, "src", "assets");

const TILE = 16;
const ATLAS_COLS = 12;

function applyTint(data, tint) {
  const tr = (tint >> 16) & 0xff;
  const tg = (tint >> 8) & 0xff;
  const tb = tint & 0xff;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    data[i] = Math.min(255, Math.round((data[i] * tr) / 255));
    data[i + 1] = Math.min(255, Math.round((data[i + 1] * tg) / 255));
    data[i + 2] = Math.min(255, Math.round((data[i + 2] * tb) / 255));
  }
}

function main() {
  const states = JSON.parse(readFileSync(join(ASSETS_IN, "blocks_states.json"), "utf8"));
  const models = JSON.parse(readFileSync(join(ASSETS_IN, "blocks_models.json"), "utf8"));
  const texContent = JSON.parse(readFileSync(join(ASSETS_IN, "texture_content.json"), "utf8"));

  // texture_content.json contains duplicate (identical) entries — keep the first.
  const texContentByBlock = new Map();
  for (const entry of texContent) {
    if (entry.texture && typeof entry.texture === "string" && !texContentByBlock.has(entry.name)) {
      texContentByBlock.set(entry.name, entry.texture);
    }
  }
  console.log(`texture_content: ${texContent.length} entries, ${texContentByBlock.size} unique`);

  // Resolve every whitelisted block into face textures; register unique tiles.
  const tileIndex = new Map(); // tile key -> atlas index
  const tileSpecs = []; // { key, file?: textureName, dataUrl? }
  function tileFor(key, spec) {
    let idx = tileIndex.get(key);
    if (idx === undefined) {
      idx = tileSpecs.length;
      tileIndex.set(key, idx);
      tileSpecs.push(spec);
    }
    return idx;
  }

  const blocks = [];
  const missing = [];
  const flatFallback = [];
  for (const id of WHITELIST) {
    const faces = resolveBlockFaces(id, states, models);
    if (faces) {
      const faceTiles = {};
      for (const dir of ["up", "down", "north", "south", "east", "west"]) {
        const tex = faces[dir];
        if (!existsSync(join(ASSETS_IN, "blocks", `${tex}.png`))) {
          missing.push(`${id} (texture file ${tex}.png not fetched)`);
          break;
        }
        faceTiles[dir] = tileFor(tex, { key: tex, file: tex });
      }
      if (Object.keys(faceTiles).length === 6) {
        blocks.push({ id, faces: faceTiles, tile: faceTiles.south });
        continue;
      }
    }
    const dataUrl = texContentByBlock.get(id);
    if (!dataUrl) {
      missing.push(`${id} (no model resolution and no texture_content fallback)`);
      continue;
    }
    if (!faces) flatFallback.push(id);
    const idx = tileFor(`inline:${id}`, { key: `inline:${id}`, dataUrl });
    blocks.push({ id, faces: null, tile: idx });
  }

  if (missing.length) {
    console.error("MISSING ASSETS:\n  " + missing.join("\n  ") + "\nRun: node scripts/fetch-textures.mjs");
    process.exit(1);
  }
  if (blocks.length > SYMBOLS.length + 1) {
    console.error(`Whitelist (${blocks.length}) exceeds symbol capacity`);
    process.exit(1);
  }
  if (flatFallback.length) {
    console.log(`flat fallback (single texture on all faces): ${flatFallback.join(", ")}`);
  }

  // Decode tiles (animated textures: use the first frame), bake tints.
  const tiles = tileSpecs.map((spec) => {
    const raw = spec.file
      ? readFileSync(join(ASSETS_IN, "blocks", `${spec.file}.png`))
      : Buffer.from(spec.dataUrl.slice(spec.dataUrl.indexOf(",") + 1), "base64");
    const png = PNG.sync.read(raw);
    if (png.width !== TILE || png.height % TILE !== 0) {
      console.error(`${spec.key}: texture is ${png.width}x${png.height}, expected ${TILE}x?${TILE}`);
      process.exit(1);
    }
    const frame = Buffer.alloc(TILE * TILE * 4);
    png.data.copy(frame, 0, 0, TILE * TILE * 4);
    if (png.height > TILE) console.log(`${spec.key}: animated (${png.width}x${png.height}), using first frame`);
    const tint = spec.file ? TINTS.get(spec.file) : undefined;
    if (tint) {
      applyTint(frame, tint);
      console.log(`${spec.key}: baked tint 0x${tint.toString(16).padStart(6, "0")}`);
    }
    return frame;
  });

  // Compose atlas.
  const cols = ATLAS_COLS;
  const rows = Math.ceil(tiles.length / cols);
  const atlas = new PNG({ width: cols * TILE, height: rows * TILE });
  tiles.forEach((data, i) => {
    const cx = (i % cols) * TILE;
    const cy = Math.floor(i / cols) * TILE;
    for (let y = 0; y < TILE; y++) {
      const srcStart = y * TILE * 4;
      const dstStart = ((cy + y) * atlas.width + cx) * 4;
      data.copy(atlas.data, dstStart, srcStart, srcStart + TILE * 4);
    }
  });
  const atlasPng = PNG.sync.write(atlas);

  // Emit runtime catalog.
  const catalog = {
    atlas: { tileSize: TILE, cols, rows },
    blocks: blocks.map((b, i) => ({
      id: b.id,
      symbol: SYMBOLS[i],
      tile: b.tile,
      transparent: TRANSPARENT.has(b.id),
      ...(b.faces ? { faces: b.faces } : {}),
    })),
  };

  mkdirSync(ASSETS_OUT, { recursive: true });
  writeFileSync(join(ASSETS_OUT, "atlas.png"), atlasPng);
  writeFileSync(join(ASSETS_OUT, "palette.json"), JSON.stringify(catalog, null, 2));

  console.log(`atlas.png: ${cols * TILE}x${rows * TILE} (${tiles.length} tiles)`);
  console.log(`palette.json: ${blocks.length} blocks`);
  const multi = blocks.filter((b) => b.faces && new Set(Object.values(b.faces)).size > 1);
  if (multi.length) {
    console.log("\nPer-face blocks (up/down vs sides):");
    for (const b of multi) {
      console.log(`  ${b.id}: ${[...new Set(Object.values(b.faces))].join(", ")}`);
    }
  }
  console.log("\nPalette table:");
  for (const { symbol, id } of catalog.blocks) console.log(`  ${symbol} = ${id}`);
  console.log(`  . = air`);
}

main();