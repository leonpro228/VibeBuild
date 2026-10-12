/**
 * Build-time pipeline: raw Minecraft asset JSONs -> compact runtime catalog + texture atlas.
 *
 * Input  (json assets/): blocks_states.json, texture_content.json
 * Output (src/assets/):  palette.json, atlas.png
 *
 * v1 simplification: one texture per block (the pack has no separate _top/_side
 * textures), full cubes only. `.` is reserved for air and never assigned.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";

import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ASSETS_IN = join(ROOT, "json assets");
const ASSETS_OUT = join(ROOT, "src", "assets");

const TILE = 16;
const ATLAS_COLS = 12;

/** '.' is air and is NOT part of this string. */
const SYMBOLS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!?#$%&*+-=,_.@";

/**
 * Curated whitelist of full-cube blocks, ordered semantically.
 * Names must match vanilla block ids (and texture_content.json entries).
 */
const WHITELIST = [
  // Stones and bricks
  "stone", "cobblestone", "mossy_cobblestone", "stone_bricks", "mossy_stone_bricks",
  "chiseled_stone_bricks", "smooth_stone", "granite", "diorite", "andesite",
  "deepslate", "cobbled_deepslate", "deepslate_bricks", "blackstone",
  "polished_blackstone_bricks", "bricks", "netherrack", "nether_bricks",
  "obsidian", "end_stone_bricks", "quartz_block", "quartz_bricks", "dark_prismarine",
  // Terrain
  "grass_block", "dirt", "sand", "gravel", "snow_block", "clay", "moss_block", "hay_block",
  // Wood
  "oak_planks", "spruce_planks", "birch_planks", "jungle_planks", "acacia_planks",
  "dark_oak_planks", "crimson_planks", "warped_planks",
  "oak_log", "spruce_log", "birch_log", "dark_oak_log",
  // Decor / light
  "glass", "glowstone", "sea_lantern", "shroomlight",
  // Wool
  "white_wool", "light_gray_wool", "gray_wool", "black_wool",
  "red_wool", "blue_wool", "yellow_wool", "lime_wool",
  // Concrete
  "white_concrete", "light_gray_concrete", "gray_concrete", "black_concrete",
  "red_concrete", "blue_concrete", "yellow_concrete", "lime_concrete",
  // Metals
  "iron_block", "gold_block", "diamond_block", "coal_block", "redstone_block", "lapis_block",
  // Leaves (transparent texture, rendered with alpha test)
  "oak_leaves", "spruce_leaves", "cherry_leaves",
  // Misc
  "terracotta",
];

const TRANSPARENT = new Set(["glass", "oak_leaves", "spruce_leaves", "cherry_leaves"]);

function main() {
  const states = JSON.parse(readFileSync(join(ASSETS_IN, "blocks_states.json"), "utf8"));
  const texContent = JSON.parse(readFileSync(join(ASSETS_IN, "texture_content.json"), "utf8"));

  // texture_content.json contains duplicate (identical) entries — keep the first.
  const textures = new Map();
  for (const entry of texContent) {
    if (entry.texture && typeof entry.texture === "string" && !textures.has(entry.name)) {
      textures.set(entry.name, entry.texture);
    }
  }
  console.log(`texture_content: ${texContent.length} entries, ${textures.size} unique`);

  const blocks = [];
  const missing = [];
  for (const id of WHITELIST) {
    if (!states[id]) missing.push(`${id} (no blockstate)`);
    const dataUrl = textures.get(id);
    if (!dataUrl) missing.push(`${id} (no texture)`);
    if (missing.length && missing.at(-1).startsWith(id)) continue;
    blocks.push({ id, png: Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64") });
  }
  if (missing.length) {
    console.error("MISSING ASSETS:\n  " + missing.join("\n  "));
    process.exit(1);
  }
  if (blocks.length > SYMBOLS.length + 1) {
    console.error(`Whitelist (${blocks.length}) exceeds symbol capacity`);
    process.exit(1);
  }

  // Decode tiles, sanity-check sizes (animated textures: use the first frame).
  const tiles = [];
  for (const b of blocks) {
    const png = PNG.sync.read(b.png);
    if (png.width !== TILE) {
      console.error(`${b.id}: texture is ${png.width}x${png.height}, expected width ${TILE}`);
      process.exit(1);
    }
    if (png.height % TILE !== 0) {
      console.error(`${b.id}: texture height ${png.height} is not a multiple of ${TILE}`);
      process.exit(1);
    }
    if (png.height === TILE) {
      tiles.push(png.data);
    } else {
      console.log(`${b.id}: animated (${png.width}x${png.height}), using first frame`);
      const frame = Buffer.alloc(TILE * TILE * 4);
      png.data.copy(frame, 0, 0, TILE * TILE * 4);
      tiles.push(frame);
    }
  }

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
      tile: i,
      transparent: TRANSPARENT.has(b.id),
    })),
  };

  mkdirSync(ASSETS_OUT, { recursive: true });
  writeFileSync(join(ASSETS_OUT, "atlas.png"), atlasPng);
  writeFileSync(join(ASSETS_OUT, "palette.json"), JSON.stringify(catalog, null, 2));

  console.log(`atlas.png: ${cols * TILE}x${rows * TILE} (${tiles.length} tiles)`);
  console.log(`palette.json: ${blocks.length} blocks`);
  console.log("\nPalette table (for the LLM system prompt later):");
  for (const { symbol, id } of catalog.blocks) console.log(`  ${symbol} = ${id}`);
  console.log(`  . = air`);
}

main();
