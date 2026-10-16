import { PALETTE_BLOCKS, layerToSymbolRows } from "./palette.ts";
import { demoBuild } from "../build/demo";
import type { Build } from "../build/types";

const MAX_DIM = 24;

/**
 * The few-shot example is generated from the demo fixture (so the prompt can
 * never desync from what the renderer actually draws), but its name is
 * translated: the whole prompt is English, and models tend to copy the
 * example's name style.
 */
const DEMO_EXAMPLE_NAME = "Small medieval house";

function paletteTable(): string {
  return PALETTE_BLOCKS.map((b) => `${b.symbol} = ${b.id}`).join("\n");
}

function buildToExample(build: Build): string {
  const layers = build.layers.map((layer) => ({
    y: layer.y,
    rows: layerToSymbolRows(layer.rows),
  }));
  return JSON.stringify({ name: DEMO_EXAMPLE_NAME, layers }, null, 2);
}

export function buildSystemPrompt(): string {
  return `You are a Minecraft build generator. You return ONLY a JSON object — no explanations, no markdown.

Response format:
{
  "name": "a short build name",
  "layers": [
    { "y": 0, "rows": [".....", "..AAA", "..."] },
    { "y": 1, "rows": ["..."] }
  ]
}

Rules:
1. Each layer is a horizontal slice of the build at height y. y starts at 0 (the ground) and grows upward with no gaps.
2. rows is an array of strings: a string is a row along depth (z), a character in the string is a block along width (x). Row 0 is the north side.
3. One character = one block. "." = air (empty space).
4. Use ONLY the characters from the palette below. No other characters.
5. All rows of a layer must be the same length; all layers must have the same size (the same width and depth in every layer).
6. Maximum build size: ${MAX_DIM}×${MAX_DIM}×${MAX_DIM} (width×height×depth). 8–16 blocks in width and depth is optimal.
7. The bottom layer (y=0) is the foundation or floor. Do not leave blocks "hanging in the air": every block must rest on the block below it or on the ground.
8. Make the build hollow inside where appropriate (houses, towers) and leave openings for doors and windows.
9. Show artistic taste: combine materials, add details (cornices, columns, roofs, windows).

Block palette:
${paletteTable()}
. = air

Example of a correct response (a 5×5 house, height 4):
${buildToExample(demoBuild)}`;
}

export function buildUserPrompt(userRequest: string): string {
  return `User request: «${userRequest}»

Generate a build following the format from the instructions. Remember the ${MAX_DIM}×${MAX_DIM}×${MAX_DIM} limit.`;
}

export function buildRepairPrompt(
  userRequest: string,
  previousResponse: string,
  errors: string[],
): string {
  const errorList = errors.map((e, i) => `${i + 1}. ${e}`).join("\n");
  return `User request: «${userRequest}»

Your previous response contained errors. Fix them and return the corrected JSON in full (JSON only, no explanations).

Errors:
${errorList}

Previous response:
${previousResponse.slice(0, 4000)}`;
}
