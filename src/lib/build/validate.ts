import { z } from "zod";
import { INFO_BY_ID, symbolToId } from "../palette/palette.ts";
import type { Build } from "./types.ts";
import { format, type Lang } from "../i18n.ts";

/** Soft cap from the system prompt — only produces a warning, not an error. */
export const MAX_DIM = 24;

/**
 * Machine-readable validation message: `code` selects a template per language,
 * `params` fills its placeholders. Diagnostics travel to two consumers that
 * need different languages — the UI (current UI language) and the repair
 * prompt (always English) — so validation itself never renders text.
 */
export interface Diag {
  code: DiagCode;
  params?: Record<string, string | number>;
}

export type DiagCode =
  | "noJson"
  | "badJson"
  | "schemaField"
  | "schemaRoot"
  | "dupLayer"
  | "noRowsGrid"
  | "emptyLayers"
  | "emptyCell"
  | "unknownSymbol"
  | "unknownBlock"
  | "shortRows"
  | "missingLayers"
  | "sizeMismatch"
  | "oversize"
  | "noName";

const DIAG_TEXT: Record<DiagCode, Record<Lang, string>> = {
  noJson: {
    ru: "В ответе модели не найден JSON-объект",
    en: "No JSON object found in the model response",
  },
  badJson: { ru: "JSON не парсится: {reason}", en: "JSON failed to parse: {reason}" },
  schemaField: { ru: 'поле "{path}": {message}', en: 'field "{path}": {message}' },
  schemaRoot: { ru: "корень JSON: {message}", en: "JSON root: {message}" },
  dupLayer: { ru: "Дублирующийся слой y={y}", en: "Duplicate layer y={y}" },
  noRowsGrid: {
    ru: 'Слой y={y}: нет ни "rows", ни "grid"',
    en: 'Layer y={y}: neither "rows" nor "grid"',
  },
  emptyLayers: { ru: "Все слои пусты", en: "All layers are empty" },
  emptyCell: {
    ru: 'Слой y={y}, строка {row}, позиция {x}: пустая ячейка (используй "." для воздуха)',
    en: 'Layer y={y}, row {row}, position {x}: empty cell (use "." for air)',
  },
  unknownSymbol: {
    ru: 'Слой y={y}, строка {row}, позиция {x}: неизвестный символ "{symbol}" — используй только символы из палитры или "." для воздуха',
    en: 'Layer y={y}, row {row}, position {x}: unknown symbol "{symbol}" — use only palette symbols or "." for air',
  },
  unknownBlock: {
    ru: 'Слой y={y}, строка {row}, позиция {x}: неизвестный блок "{block}"',
    en: 'Layer y={y}, row {row}, position {x}: unknown block "{block}"',
  },
  shortRows: {
    ru: "Слой y={y}: строки короче остальных — дополнены воздухом",
    en: "Layer y={y}: some rows are shorter than the rest — padded with air",
  },
  missingLayers: {
    ru: "Слои {ys} отсутствовали в ответе — заполнены воздухом",
    en: "Layers {ys} were missing from the response — filled with air",
  },
  sizeMismatch: {
    ru: "Заявленный размер {dw}×{dh}×{dd} не совпадает с фактическим {aw}×{ah}×{ad} (используется фактический)",
    en: "Declared size {dw}×{dh}×{dd} does not match the actual {aw}×{ah}×{ad} (using the actual one)",
  },
  oversize: {
    ru: "Размер {w}×{h}×{d} превышает рекомендованный лимит {max}×{max}×{max}",
    en: "Size {w}×{h}×{d} exceeds the recommended limit of {max}×{max}×{max}",
  },
  noName: {
    ru: "Название постройки отсутствовало — использовано «{name}»",
    en: "Build name was missing — using “{name}”",
  },
};

/** Renders one diagnostic in the given language (UI or repair prompt). */
export function formatDiag(diag: Diag, lang: Lang): string {
  const template = DIAG_TEXT[diag.code][lang];
  return format(template, diag.params ?? {});
}

/** Renders a whole diagnostic list. */
export function formatDiags(diags: Diag[], lang: Lang): string[] {
  return diags.map((d) => formatDiag(d, lang));
}

/**
 * Zod messages are written in English (they go verbatim into the repair
 * prompt); the UI side is localized back through this table. Anything not
 * listed here is shown as-is in both languages.
 */
const SCHEMA_MSG: Record<string, Record<Lang, string>> = {
  "y must be an integer": { ru: "y должен быть целым числом", en: "y must be an integer" },
  "y cannot be negative": { ru: "y не может быть отрицательным", en: "y cannot be negative" },
  "layers array is empty": { ru: "массив layers пуст", en: "layers array is empty" },
};

const layerSchema = z.object({
  y: z.number().int("y must be an integer").nonnegative("y cannot be negative"),
  rows: z.array(z.string()).optional(),
  grid: z.array(z.array(z.string())).optional(),
});

const responseSchema = z.object({
  name: z.string().optional(),
  size: z
    .object({
      width: z.number(),
      height: z.number(),
      depth: z.number(),
    })
    .optional(),
  layers: z.array(layerSchema).min(1, "layers array is empty"),
});

export type ValidationResult =
  | { ok: true; build: Build; warnings: Diag[] }
  | { ok: false; errors: Diag[]; warnings: Diag[] };

/** Extracts the JSON object from a raw LLM response (tolerates fences and chatter). */
export function extractJson(text: string): string | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

/** One cell of a layer: either a single palette symbol or a full block id. */
function cellToId(cell: string, y: number, z: number, x: number, errors: Diag[]): string {
  const trimmed = cell.trim();
  if (!trimmed) {
    errors.push({ code: "emptyCell", params: { y, row: z, x } });
    return "air";
  }
  if (trimmed.length === 1) {
    const id = symbolToId(trimmed);
    if (!id) {
      errors.push({ code: "unknownSymbol", params: { y, row: z, x, symbol: trimmed } });
      return "air";
    }
    return id;
  }
  // Full block id (legacy/verbose format, e.g. "cobblestone")
  const id = trimmed.toLowerCase().replace(/\s+/g, "_");
  if (id === "air") return "air";
  if (!INFO_BY_ID.has(id)) {
    errors.push({ code: "unknownBlock", params: { y, row: z, x, block: cell } });
    return "air";
  }
  return id;
}

interface RawLayer {
  y: number;
  cells: string[][];
}

export function validateLLMResponse(text: string, lang: Lang): ValidationResult {
  const warnings: Diag[] = [];
  const errors: Diag[] = [];

  const jsonText = extractJson(text);
  if (!jsonText) {
    return { ok: false, errors: [{ code: "noJson" }], warnings };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    return {
      ok: false,
      errors: [{ code: "badJson", params: { reason: (e as Error).message } }],
      warnings,
    };
  }

  const res = responseSchema.safeParse(parsed);
  if (!res.success) {
    const issues = res.error.issues.map((i): Diag => {
      const path = i.path.join(".");
      const message = SCHEMA_MSG[i.message]?.[lang] ?? i.message;
      return path.length
        ? { code: "schemaField", params: { path, message } }
        : { code: "schemaRoot", params: { message } };
    });
    return { ok: false, errors: issues, warnings };
  }

  // 1. Normalize layers, resolve cells to block ids.
  const byY = new Map<number, RawLayer>();
  for (const layer of res.data.layers) {
    if (byY.has(layer.y)) {
      errors.push({ code: "dupLayer", params: { y: layer.y } });
      continue;
    }
    let cells: string[][];
    if (layer.rows) {
      cells = layer.rows.map((row) => [...row]);
    } else if (layer.grid) {
      cells = layer.grid;
    } else {
      errors.push({ code: "noRowsGrid", params: { y: layer.y } });
      continue;
    }
    byY.set(layer.y, { y: layer.y, cells });
  }

  // 2. Target geometry: width/depth = maxima across all layers.
  const width = Math.max(0, ...[...byY.values()].flatMap((l) => l.cells.map((r) => r.length)));
  const depth = Math.max(0, ...[...byY.values()].map((l) => l.cells.length));
  if (width === 0 || depth === 0) {
    errors.push({ code: "emptyLayers" });
    return { ok: false, errors, warnings };
  }

  const ys = [...byY.keys()].sort((a, b) => a - b);
  const height = (ys[ys.length - 1] ?? 0) + 1;

  // 3. Resolve cells with coordinates for precise error messages.
  const resolved = new Map<number, string[][]>();
  for (const layer of byY.values()) {
    const rows: string[][] = [];
    layer.cells.forEach((row, z) => {
      const ids: string[] = [];
      row.forEach((cell, x) => {
        ids.push(cellToId(cell, layer.y, z, x, errors));
      });
      rows.push(ids);
    });
    resolved.set(layer.y, rows);
  }

  // 4. Build the full height range, filling gaps with air.
  const layers: Build["layers"] = [];
  const gapYs: number[] = [];
  for (let y = 0; y < height; y++) {
    const layer = resolved.get(y);
    if (!layer) {
      gapYs.push(y);
      layers.push({
        y,
        rows: Array.from({ length: depth }, () => Array.from({ length: width }, () => "air")),
      });
      continue;
    }
    // Pad short rows / missing rows with air (trailing omissions are common).
    const rows: string[][] = [];
    let padded = false;
    for (let z = 0; z < depth; z++) {
      const row = layer[z] ?? [];
      if (row.length < width) padded = true;
      rows.push(Array.from({ length: width }, (_, x) => row[x] ?? "air"));
    }
    if (padded) warnings.push({ code: "shortRows", params: { y } });
    layers.push({ y, rows });
  }
  if (gapYs.length > 0) {
    warnings.push({
      code: "missingLayers",
      params: { ys: gapYs.map((y) => `y=${y}`).join(", ") },
    });
  }

  // 5. Declared size (informational only — we trust the grids).
  const declared = res.data.size;
  if (declared && (declared.width !== width || declared.depth !== depth || declared.height !== height)) {
    warnings.push({
      code: "sizeMismatch",
      params: {
        dw: declared.width,
        dh: declared.height,
        dd: declared.depth,
        aw: width,
        ah: height,
        ad: depth,
      },
    });
  }

  // 6. Soft limits.
  if (width > MAX_DIM || height > MAX_DIM || depth > MAX_DIM) {
    warnings.push({
      code: "oversize",
      params: { w: width, h: height, d: depth, max: MAX_DIM },
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }

  const build: Build = {
    name: res.data.name?.trim() || STRINGS_NAME[lang],
    size: { width, height, depth },
    layers,
  };
  if (!res.data.name?.trim()) warnings.push({ code: "noName", params: { name: STRINGS_NAME[lang] } });

  return { ok: true, build, warnings };
}

/** Default build name when the model omitted it, per UI language. */
const STRINGS_NAME: Record<Lang, string> = {
  ru: "Постройка",
  en: "Build",
};
