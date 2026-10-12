import { z } from "zod";
import { INFO_BY_ID, symbolToId } from "../palette/palette.ts";
import type { Build } from "./types.ts";

/** Soft cap from the system prompt — only produces a warning, not an error. */
export const MAX_DIM = 24;

const layerSchema = z.object({
  y: z.number().int("y должен быть целым числом").nonnegative("y не может быть отрицательным"),
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
  layers: z.array(layerSchema).min(1, "массив layers пуст"),
});

export type ValidationResult =
  | { ok: true; build: Build; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

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
function cellToId(cell: string, ctx: string, errors: string[]): string {
  const trimmed = cell.trim();
  if (!trimmed) {
    errors.push(`${ctx}: пустая ячейка (используй "." для воздуха)`);
    return "air";
  }
  if (trimmed.length === 1) {
    const id = symbolToId(trimmed);
    if (!id) {
      errors.push(
        `${ctx}: неизвестный символ "${trimmed}" — используй только символы из палитры или "." для воздуха`,
      );
      return "air";
    }
    return id;
  }
  // Full block id (legacy/verbose format, e.g. "cobblestone")
  const id = trimmed.toLowerCase().replace(/\s+/g, "_");
  if (id === "air") return "air";
  if (!INFO_BY_ID.has(id)) {
    errors.push(`${ctx}: неизвестный блок "${cell}"`);
    return "air";
  }
  return id;
}

interface RawLayer {
  y: number;
  cells: string[][];
}

export function validateLLMResponse(text: string): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  const jsonText = extractJson(text);
  if (!jsonText) {
    return { ok: false, errors: ["В ответе модели не найден JSON-объект"], warnings };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    return {
      ok: false,
      errors: [`JSON не парсится: ${(e as Error).message}`],
      warnings,
    };
  }

  const res = responseSchema.safeParse(parsed);
  if (!res.success) {
    const issues = res.error.issues.map(
      (i) => `${i.path.length ? `поле "${i.path.join(".")}"` : "корень JSON"}: ${i.message}`,
    );
    return { ok: false, errors: issues, warnings };
  }

  // 1. Normalize layers, resolve cells to block ids.
  const byY = new Map<number, RawLayer>();
  for (const layer of res.data.layers) {
    if (byY.has(layer.y)) {
      errors.push(`Дублирующийся слой y=${layer.y}`);
      continue;
    }
    let cells: string[][];
    if (layer.rows) {
      cells = layer.rows.map((row) => [...row]);
    } else if (layer.grid) {
      cells = layer.grid;
    } else {
      errors.push(`Слой y=${layer.y}: нет ни "rows", ни "grid"`);
      continue;
    }
    byY.set(layer.y, { y: layer.y, cells });
  }

  // 2. Target geometry: width/depth = maxima across all layers.
  const width = Math.max(0, ...[...byY.values()].flatMap((l) => l.cells.map((r) => r.length)));
  const depth = Math.max(0, ...[...byY.values()].map((l) => l.cells.length));
  if (width === 0 || depth === 0) {
    errors.push("Все слои пусты");
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
        ids.push(cellToId(cell, `Слой y=${layer.y}, строка ${z}, позиция ${x}`, errors));
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
    if (padded) warnings.push(`Слой y=${y}: строки короче остальных — дополнены воздухом`);
    layers.push({ y, rows });
  }
  if (gapYs.length > 0) {
    warnings.push(
      `Слои ${gapYs.map((y) => `y=${y}`).join(", ")} отсутствовали в ответе — заполнены воздухом`,
    );
  }

  // 5. Declared size (informational only — we trust the grids).
  const declared = res.data.size;
  if (declared && (declared.width !== width || declared.depth !== depth || declared.height !== height)) {
    warnings.push(
      `Заявленный размер ${declared.width}×${declared.height}×${declared.depth} не совпадает с фактическим ${width}×${height}×${depth} (используется фактический)`,
    );
  }

  // 6. Soft limits.
  if (width > MAX_DIM || height > MAX_DIM || depth > MAX_DIM) {
    warnings.push(
      `Размер ${width}×${height}×${depth} превышает рекомендованный лимит ${MAX_DIM}×${MAX_DIM}×${MAX_DIM}`,
    );
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }

  const build: Build = {
    name: res.data.name?.trim() || "Постройка",
    size: { width, height, depth },
    layers,
  };
  if (!res.data.name?.trim()) warnings.push("Название постройки отсутствовало — использовано «Постройка»");

  return { ok: true, build, warnings };
}
