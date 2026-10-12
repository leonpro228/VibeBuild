import { PALETTE_BLOCKS, layerToSymbolRows } from "./palette.ts";
import { demoBuild } from "../build/demo";
import type { Build } from "../build/types";

const MAX_DIM = 24;

function paletteTable(): string {
  return PALETTE_BLOCKS.map((b) => `${b.symbol} = ${b.id}`).join("\n");
}

function buildToExample(build: Build): string {
  const layers = build.layers.map((layer) => ({
    y: layer.y,
    rows: layerToSymbolRows(layer.rows),
  }));
  return JSON.stringify({ name: build.name, layers }, null, 2);
}

export function buildSystemPrompt(): string {
  return `Ты — генератор построек для Minecraft. Ты возвращаешь ТОЛЬКО JSON-объект без пояснений, без markdown-разметки.

Формат ответа:
{
  "name": "короткое название постройки",
  "layers": [
    { "y": 0, "rows": [".....", "..AAA", "..."] },
    { "y": 1, "rows": ["..."] }
  ]
}

Правила:
1. Каждый слой — горизонтальный срез постройки на высоте y. y начинается с 0 (земля) и растёт вверх без пропусков.
2. rows — массив строк: строка = ряд по глубине (z), символ в строке = блок по ширине (x). Строка 0 — северная сторона.
3. Один символ = один блок. "." = воздух (пустота).
4. Используй ТОЛЬКО символы из палитры ниже. Никаких других символов.
5. Все строки слоя одной длины; все слои одного размера (ширина и глубина одинаковы во всех слоях).
6. Максимальный размер постройки: ${MAX_DIM}×${MAX_DIM}×${MAX_DIM} (ширина×высота×глубина). Оптимально 8–16 блоков по ширине и глубине.
7. Нижний слой (y=0) — фундамент или пол. Не оставляй блоки «висящими в воздухе»: каждый блок должен опираться на блок под ним или на землю.
8. Делай постройку полой внутри, где это уместно (дома, башни), оставляй проёмы для дверей и окон.
9. Проявляй художественный вкус: сочетай материалы, добавляй детали (карнизы, колонны, крыши, окна).

Палитра блоков:
${paletteTable()}
. = воздух

Пример корректного ответа (домик 5×5, высота 4):
${buildToExample(demoBuild)}`;
}

export function buildUserPrompt(userRequest: string): string {
  return `Запрос пользователя: «${userRequest}»

Сгенерируй постройку по формату из инструкции. Помни про лимит ${MAX_DIM}×${MAX_DIM}×${MAX_DIM}.`;
}

export function buildRepairPrompt(
  userRequest: string,
  previousResponse: string,
  errors: string[],
): string {
  const errorList = errors.map((e, i) => `${i + 1}. ${e}`).join("\n");
  return `Запрос пользователя: «${userRequest}»

Твой предыдущий ответ содержал ошибки. Исправь их и верни исправленный JSON целиком (только JSON, без пояснений).

Ошибки:
${errorList}

Предыдущий ответ:
${previousResponse.slice(0, 4000)}`;
}
