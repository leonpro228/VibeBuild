/**
 * Downloads the per-face block textures needed by the palette whitelist from
 * PrismarineJS/minecraft-assets (vanilla resource-pack PNGs, data/26.1/blocks).
 * Files are cached in "json assets/blocks/<name>.png"; re-runs skip existing.
 *
 * Run once after editing WHITELIST:  node scripts/fetch-textures.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { WHITELIST } from "./palette-config.mjs";
import { resolveBlockFaces } from "./model-faces.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ASSETS_IN = join(ROOT, "json assets");
const BLOCKS_DIR = join(ASSETS_IN, "blocks");
const RAW_BASE =
  "https://raw.githubusercontent.com/PrismarineJS/minecraft-assets/master/data/26.1/blocks";

async function download(name) {
  const res = await fetch(`${RAW_BASE}/${name}.png`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error("empty body");
  writeFileSync(join(BLOCKS_DIR, `${name}.png`), buf);
}

async function main() {
  const states = JSON.parse(readFileSync(join(ASSETS_IN, "blocks_states.json"), "utf8"));
  const models = JSON.parse(readFileSync(join(ASSETS_IN, "blocks_models.json"), "utf8"));
  mkdirSync(BLOCKS_DIR, { recursive: true });

  // Collect every texture referenced by any whitelisted block's faces.
  const needed = new Map(); // textureName -> Set(blockIds)
  const unresolved = [];
  for (const id of WHITELIST) {
    const faces = resolveBlockFaces(id, states, models);
    if (!faces) {
      unresolved.push(id);
      continue;
    }
    for (const tex of new Set(Object.values(faces))) {
      if (!needed.has(tex)) needed.set(tex, new Set());
      needed.get(tex).add(id);
    }
  }

  console.log(
    `resolved ${WHITELIST.length - unresolved.length}/${WHITELIST.length} blocks, ` +
      `${needed.size} unique textures`,
  );
  if (unresolved.length) {
    console.log("unresolved (flat fallback from texture_content): " + unresolved.join(", "));
  }

  const names = [...needed.keys()];
  let index = 0;
  let cached = 0;
  const failed = [];
  async function worker() {
    while (index < names.length) {
      const name = names[index++];
      if (existsSync(join(BLOCKS_DIR, `${name}.png`))) {
        cached++;
        continue;
      }
      try {
        await download(name);
      } catch (e) {
        failed.push(`${name} (${e.message})`);
      }
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));

  console.log(`downloaded: ${names.length - cached - failed.length}, cached: ${cached}, failed: ${failed.length}`);
  if (failed.length) {
    console.log("FAILED (those blocks will use flat fallback):\n  " + failed.join("\n  "));
    process.exit(1);
  }
}

main();