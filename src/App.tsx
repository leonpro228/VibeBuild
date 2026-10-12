import { useCallback, useEffect, useRef, useState } from "react";
import { Viewer3D } from "./components/Viewer3D";
import { demoBuild, materials } from "./lib/build/demo";
import type { Build } from "./lib/build/types";

type Phase = "idle" | "generating" | "ready";

const SUGGESTIONS = ["Замок 10×10", "Домик 5×5", "Башня волшебника", "Мост через реку"];

const GENERATION_STEPS = [
  "Разбираю запрос…",
  "Планирую структуру…",
  "Генерирую слои…",
  "Проверяю блоки…",
  "Собираю сцену…",
];

export default function App() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [prompt, setPrompt] = useState("");
  const [build, setBuild] = useState<Build | null>(null);
  const [status, setStatus] = useState("");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const generate = useCallback((text: string, instant = false) => {
    if (!text.trim()) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPrompt(text);
    setBuild(null);
    if (instant) {
      setStatus("");
      setBuild({ ...demoBuild, name: text.trim() });
      setPhase("ready");
      return;
    }
    setPhase("generating");

    // Demo pipeline: no LLM yet (roadmap step 4) — we stage the status messages
    // and then show the fixture build, exactly as the real flow will behave.
    GENERATION_STEPS.forEach((step, i) => {
      timers.current.push(setTimeout(() => setStatus(step), 350 + i * 550));
    });
    timers.current.push(
      setTimeout(() => {
        setStatus("");
        setBuild({ ...demoBuild, name: text.trim() });
        setPhase("ready");
      }, 350 + GENERATION_STEPS.length * 550),
    );
  }, []);

  // Dev convenience: /?demo shows the fixture build immediately (used by
  // headless screenshot checks and future e2e tests).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("demo")) {
      generate("Домик 5×5", true);
    }
  }, [generate]);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#0b0e14] text-slate-200">
      {/* 3D viewport: mounted in every phase, so it persists through the morph */}
      <div
        className={`absolute inset-x-0 bottom-0 transition-all duration-700 ease-out ${
          phase === "idle"
            ? "top-[55%] opacity-0" /* collapsed while idle */
            : "top-14 opacity-100"
        }`}
      >
        <Viewer3D build={build} />
      </div>

      {/* Top bar (after generation starts) */}
      <header
        className={`absolute inset-x-0 top-0 z-10 flex h-14 items-center gap-3 border-b border-white/5 bg-[#0b0e14]/80 px-4 backdrop-blur transition-opacity duration-500 ${
          phase === "idle" ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <span className="bg-gradient-to-r from-emerald-300 to-sky-400 bg-clip-text text-lg font-bold text-transparent">
          VibeBuild
        </span>
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            generate(prompt);
          }}
        >
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.currentTarget.value)}
            placeholder="Опиши постройку…"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm outline-none placeholder:text-slate-500 focus:border-emerald-400/50"
          />
          <button
            type="submit"
            className="rounded-lg bg-emerald-500/90 px-4 py-1.5 text-sm font-medium text-[#0b0e14] transition hover:bg-emerald-400"
          >
            Построить
          </button>
        </form>
      </header>

      {/* Welcome screen: greeting + centered prompt (fades out into the viewport) */}
      <div
        className={`absolute inset-0 z-20 flex flex-col items-center justify-center px-6 transition-all duration-700 ease-out ${
          phase === "idle" ? "opacity-100" : "pointer-events-none -translate-y-24 opacity-0"
        }`}
      >
        <h1 className="bg-gradient-to-r from-emerald-300 to-sky-400 bg-clip-text text-4xl font-bold text-transparent sm:text-5xl">
          VibeBuild
        </h1>
        <p className="mt-3 max-w-md text-center text-slate-400">
          Опиши постройку — ИИ сгенерирует её по слоям, покажет в 3D и распишет
          пошаговую инструкцию.
        </p>
        <form
          className="mt-8 w-full max-w-xl"
          onSubmit={(e) => {
            e.preventDefault();
            generate(prompt);
          }}
        >
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-2 shadow-2xl shadow-emerald-500/5 transition focus-within:border-emerald-400/50">
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.currentTarget.value)}
              placeholder="Построй замок 10×10…"
              autoFocus
              className="w-full bg-transparent px-3 py-2 outline-none placeholder:text-slate-500"
            />
            <button
              type="submit"
              className="shrink-0 rounded-xl bg-emerald-500 px-5 py-2.5 font-medium text-[#0b0e14] transition hover:bg-emerald-400"
            >
              Построить
            </button>
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => generate(s)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-slate-400 transition hover:border-emerald-400/40 hover:text-slate-200"
              >
                {s}
              </button>
            ))}
          </div>
        </form>
      </div>

      {/* Generation status overlay */}
      {phase === "generating" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center">
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#0b0e14]/90 px-5 py-3 text-sm text-slate-300">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
            {status}
          </div>
        </div>
      )}

      {/* Materials panel (demo data for now; steps panel comes in roadmap step 6) */}
      {phase === "ready" && build && (
        <aside className="absolute right-3 top-16 z-10 w-56 rounded-xl border border-white/10 bg-[#0b0e14]/85 p-3 backdrop-blur">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Материалы
          </div>
          <ul className="space-y-1 text-sm">
            {materials(build).map(({ id, count }) => (
              <li key={id} className="flex justify-between gap-2">
                <span className="truncate text-slate-300">{id}</span>
                <span className="text-slate-500">{count}</span>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}
