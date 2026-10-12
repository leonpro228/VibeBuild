import catalog from "../../assets/palette.json" with { type: "json" };

export type FaceDir = "up" | "down" | "north" | "south" | "east" | "west";

export interface PaletteBlockInfo {
  id: string;
  symbol: string;
  tile: number;
  transparent: boolean;
  /** Per-face atlas tile indices (vanilla model resolution); absent = flat tile. */
  faces?: Record<FaceDir, number>;
}

export const PALETTE_BLOCKS: PaletteBlockInfo[] = catalog.blocks as PaletteBlockInfo[];
export const ATLAS = catalog.atlas;

export const INFO_BY_ID = new Map<string, PaletteBlockInfo>(
  PALETTE_BLOCKS.map((b) => [b.id, b]),
);
export const SYMBOL_TO_ID = new Map<string, string>(PALETTE_BLOCKS.map((b) => [b.symbol, b.id]));
export const ID_TO_SYMBOL = new Map<string, string>(PALETTE_BLOCKS.map((b) => [b.id, b.symbol]));

/** '.' is reserved for air in the LLM wire format. */
export const AIR_SYMBOL = ".";

export function symbolToId(symbol: string): string | null {
  if (symbol === AIR_SYMBOL) return "air";
  return SYMBOL_TO_ID.get(symbol) ?? null;
}

/** Atlas tile for a given cube face (falls back to the flat tile). */
export function faceTile(info: PaletteBlockInfo, face: FaceDir): number {
  return info.faces?.[face] ?? info.tile;
}

/** Symbol rows for a build layer (for prompts and tests). */
export function layerToSymbolRows(rows: string[][]): string[] {
  return rows.map((row) =>
    row.map((id) => (!id || id === "air" ? AIR_SYMBOL : ID_TO_SYMBOL.get(id) ?? AIR_SYMBOL)).join(""),
  );
}
