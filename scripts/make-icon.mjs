// Generates the VibeBuild app icon: an original 16×16 pixel-art pickaxe on a
// dark rounded plate (monochrome-UI-friendly). Outputs:
//   src/assets/app-icon.svg  — vector (README, favicon)
//   src/assets/app-icon.png  — 1280×1280 raster source for `yarn tauri icon`
// The art is original (no Mojang sprites). Run: node scripts/make-icon.mjs
import { PNG } from "pngjs";
import { copyFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const CELL = 64; // px per grid cell in the raster source
const MARGIN = 2; // plate margin around the 16×16 art
const SIZE = (16 + MARGIN * 2) * CELL; // 1280

const PLATE = "#17181b";
const COLORS = {
  s: "#e4e6e9", // steel light (top highlight)
  S: "#aeb4bb", // steel mid
  D: "#71767e", // steel dark (tips, underside)
  w: "#b98753", // wood light
  W: "#8a5a2e", // wood mid
  d: "#5d3d1e", // wood dark (handle end)
};

// 16×16 art. "." = transparent. Head = steel arch with tips down both sides,
// handle = wood diagonal to the bottom-left (own design, vanilla-like).
const ART = [
  ".....ssssssss...",
  "...SSSSSSSSSSSS.",
  "...SS...wW...SS.",
  "...SS...wW...SS.",
  "...D...wW.....D.",
  "...D...wW.....D.",
  "......wW........",
  "......wW........",
  ".....wW.........",
  ".....wW.........",
  "....wW..........",
  "....wW..........",
  "...wW...........",
  "...wW...........",
  "..dW............",
  "................",
];

if (ART.length !== 16 || ART.some((r) => r.length !== 16)) {
  throw new Error("ART must be 16 rows of exactly 16 chars");
}

const art = ART.map((row) => [...row].map((ch) => (ch === "." ? null : COLORS[ch])));

// ---- SVG ------------------------------------------------------------------

function makeSvg() {
  const rects = [];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const color = art[y][x];
      if (color) rects.push(`<rect x="${x + MARGIN}" y="${y + MARGIN}" width="1" height="1" fill="${color}"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="256" height="256">
  <title>VibeBuild</title>
  <rect width="20" height="20" rx="4.5" fill="${PLATE}"/>
  <g shape-rendering="crispEdges">
${rects.map((r) => `    ${r}`).join("\n")}
  </g>
</svg>
`;
}

// ---- PNG (1280×1280, rounded plate, nearest-cell pixels) -------------------

function makePng() {
  const png = new PNG({ width: SIZE, height: SIZE });
  const half = SIZE / 2;
  const radius = SIZE * 0.225; // matches rx=4.5/20 in the SVG
  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      const cx = (px + 0.5) / CELL; // cell-space coordinates, 0..20
      const cy = (py + 0.5) / CELL;

      // Rounded-square SDF with per-sample antialiasing at the corners.
      const qx = Math.abs(cx - 10) - (10 - 4.5);
      const qy = Math.abs(cy - 10) - (10 - 4.5);
      const outside = Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - 4.5;
      const alpha = Math.max(0, Math.min(1, 0.5 - outside * CELL));

      // Pickaxe cell (integer math keeps pixels crisp).
      const ax = Math.floor(cx) - MARGIN;
      const ay = Math.floor(cy) - MARGIN;
      const color = ax >= 0 && ax < 16 && ay >= 0 && ay < 16 ? art[ay][ax] : null;

      let hex = color ?? PLATE;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      const idx = (SIZE * py + px) << 2;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = Math.round(alpha * 255);
    }
  }
  return PNG.sync.write(png, { colorType: 6 });
}

const svg = makeSvg();
writeFileSync(join(ROOT, "src/assets/app-icon.svg"), svg);
writeFileSync(join(ROOT, "src/assets/app-icon.png"), makePng());
copyFileSync(join(ROOT, "src/assets/app-icon.svg"), join(ROOT, "public/app-icon.svg"));
console.log(`app-icon.svg / app-icon.png (${SIZE}×${SIZE}) / public/app-icon.svg — OK`);
