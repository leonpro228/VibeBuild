import { useEffect, useRef } from "react";
import { stepSummary, type Step } from "../lib/build/instructions";
import { LayerPreview } from "./LayerPreview";

/** Russian plural for блок. */
function pluralBlocks(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} блок`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} блока`;
  return `${n} блоков`;
}

/**
 * Step-by-step instruction panel: layer cards with 2D previews. Selecting a
 * card enters focus mode in the 3D viewport (previous layers become ghosts).
 */
export function StepsPanel({
  steps,
  focusY,
  onSelect,
}: {
  steps: Step[];
  focusY: number | null;
  onSelect: (y: number | null) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const idx = focusY === null ? -1 : steps.findIndex((s) => s.y === focusY);
  const current = idx >= 0 ? steps[idx] : null;

  useEffect(() => {
    if (focusY === null) return;
    listRef.current
      ?.querySelector(`[data-y="${focusY}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [focusY]);

  const go = (dir: 1 | -1) => {
    if (!steps.length) return;
    if (idx < 0) {
      onSelect(dir === 1 ? steps[0].y : steps[steps.length - 1].y);
      return;
    }
    const next = steps[Math.min(steps.length - 1, Math.max(0, idx + dir))];
    onSelect(next.y);
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-white/10 bg-neutral-950/85 backdrop-blur">
      <header className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Инструкция{current ? ` · ${current.level}/${steps.length}` : ""}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => go(-1)}
            title="Предыдущий слой"
            className="rounded border border-white/10 px-2 py-0.5 text-xs text-neutral-400 transition hover:border-white/40 hover:text-white"
          >
            ←
          </button>
          <button
            onClick={() => go(1)}
            title="Следующий слой"
            className="rounded border border-white/10 px-2 py-0.5 text-xs text-neutral-400 transition hover:border-white/40 hover:text-white"
          >
            →
          </button>
          {focusY !== null && (
            <button
              onClick={() => onSelect(null)}
              title="Показать постройку целиком"
              className="rounded border border-white/10 px-2 py-0.5 text-xs text-neutral-400 transition hover:border-white/40 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>
      </header>

      {current && (
        <div className="flex flex-col items-center gap-1 border-b border-white/10 px-3 py-3">
          <LayerPreview grid={current.grid} maxSize={176} minCell={6} hint />
          <div className="w-full truncate text-center text-[10px] text-neutral-500">
            {stepSummary(current)}
          </div>
        </div>
      )}

      <div ref={listRef} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
        {steps.map((step) => (
          <button
            key={step.y}
            data-y={step.y}
            onClick={() => onSelect(step.y === focusY ? null : step.y)}
            className={`flex w-full items-center gap-2 rounded-lg border p-1.5 text-left transition ${
              step.y === focusY
                ? "border-white/60 bg-white/5"
                : "border-white/10 hover:border-white/30"
            }`}
          >
            <LayerPreview grid={step.grid} maxSize={48} />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-neutral-200">
                Уровень {step.level} <span className="text-neutral-500">· y={step.y}</span>
              </div>
              <div className="truncate text-[10px] text-neutral-500">
                {pluralBlocks(step.total)} · {stepSummary(step)}
              </div>
            </div>
          </button>
        ))}
        {steps.length === 0 && <p className="p-2 text-xs text-neutral-500">Постройка пуста</p>}
      </div>

      <footer className="border-t border-white/10 px-3 py-1.5 text-[10px] text-neutral-600">
        Клик по слою — режим сборки, ← → листают, Esc — целиком
      </footer>
    </section>
  );
}