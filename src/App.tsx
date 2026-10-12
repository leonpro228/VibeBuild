import { useCallback, useEffect, useRef, useState } from "react";
import { Viewer3D } from "./components/Viewer3D";
import { SettingsDialog } from "./components/SettingsDialog";
import { demoBuild, materials } from "./lib/build/demo";
import { validateLLMResponse } from "./lib/build/validate";
import { getSettings, streamCompletion, type ProviderSettings } from "./lib/llm/client";
import { buildRepairPrompt, buildSystemPrompt, buildUserPrompt } from "./lib/palette/prompt";
import type { Build } from "./lib/build/types";

type Phase = "idle" | "generating" | "ready" | "error";

const SUGGESTIONS = ["Замок 10×10", "Домик 5×5", "Башня волшебника", "Мост через реку"];

const DEMO_STEPS = [
  "Демо-режим (LLM не настроен)",
  "Разбираю запрос…",
  "Планирую структуру…",
  "Генерирую слои…",
  "Собираю сцену…",
];

export default function App() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [prompt, setPrompt] = useState("");
  const [build, setBuild] = useState<Build | null>(null);
  const [status, setStatus] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasSettings, setHasSettings] = useState<boolean | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const generationId = useRef(0);

  useEffect(() => {
    getSettings()
      .then((s) => setHasSettings(!!s))
      .catch(() => setHasSettings(false)); // not in Tauri (plain browser dev)
  }, []);

  const runDemo = useCallback((text: string) => {
    DEMO_STEPS.forEach((step, i) => {
      timers.current.push(setTimeout(() => setStatus(step), 300 + i * 500));
    });
    timers.current.push(
      setTimeout(() => {
        setStatus("");
        setBuild({ ...demoBuild, name: text.trim() });
        setPhase("ready");
      }, 300 + DEMO_STEPS.length * 500),
    );
  }, []);

  const streamOnce = useCallback(
    async (system: string, user: string, label: string): Promise<string> => {
      setStatus(label);
      return streamCompletion(system, user, (_chunk, total) => {
        setStatus(`${label} ${total} символов…`);
      });
    },
    [],
  );

  const generate = useCallback(
    async (text: string, instantDemo = false) => {
      if (!text.trim()) return;
      timers.current.forEach(clearTimeout);
      timers.current = [];
      const id = ++generationId.current;
      setPrompt(text);
      setBuild(null);
      setErrors([]);
      setWarnings([]);

      // Demo fallback: no Tauri runtime (plain browser) or no provider configured.
      let settings: ProviderSettings | null = null;
      try {
        settings = await getSettings();
      } catch {
        settings = null;
      }
      if (!settings) {
        setPhase("generating");
        if (instantDemo) {
          setStatus("");
          setBuild({ ...demoBuild, name: text.trim() });
          setPhase("ready");
          return;
        }
        runDemo(text);
        return;
      }

      setPhase("generating");
      try {
        const system = buildSystemPrompt();
        let raw = await streamOnce(system, buildUserPrompt(text), "Генерирую постройку…");
        if (id !== generationId.current) return;

        setStatus("Проверяю ответ…");
        let result = validateLLMResponse(raw);
        if (!result.ok) {
          // One auto-repair round-trip with precise error feedback.
          setStatus("Исправляю ошибки генерации…");
          raw = await streamOnce(system, buildRepairPrompt(text, raw, result.errors), "Исправляю…");
          if (id !== generationId.current) return;
          setStatus("Проверяю ответ…");
          result = validateLLMResponse(raw);
        }

        if (!result.ok) {
          setErrors(result.errors);
          setPhase("error");
          return;
        }
        setStatus("");
        setWarnings(result.warnings);
        setBuild(result.build);
        setPhase("ready");
      } catch (e) {
        if (id !== generationId.current) return;
        setErrors([e instanceof Error ? e.message : String(e)]);
        setPhase("error");
      }
    },
    [runDemo, streamOnce],
  );

  // Dev convenience: /?demo shows the fixture build immediately.
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
          phase === "idle" ? "top-[55%] opacity-0" /* collapsed while idle */ : "top-14 opacity-100"
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
        <button
          onClick={() => setSettingsOpen(true)}
          title="Настройки провайдера"
          className="rounded-lg border border-white/10 px-2.5 py-1.5 text-sm text-slate-400 transition hover:text-slate-200"
        >
          ⚙
        </button>
      </header>

      {/* Welcome screen: greeting + centered prompt (fades out into the viewport) */}
      <div
        className={`absolute inset-0 z-20 flex flex-col items-center justify-center px-6 transition-all duration-700 ease-out ${
          phase === "idle" ? "opacity-100" : "pointer-events-none -translate-y-24 opacity-0"
        }`}
      >
        <button
          onClick={() => setSettingsOpen(true)}
          title="Настройки провайдера"
          className={`absolute right-4 top-4 rounded-lg border border-white/10 px-2.5 py-1.5 text-sm text-slate-400 transition hover:text-slate-200 ${
            hasSettings ? "hidden" : ""
          }`}
        >
          ⚙ Настроить провайдера
        </button>
        <h1 className="bg-gradient-to-r from-emerald-300 to-sky-400 bg-clip-text text-4xl font-bold text-transparent sm:text-5xl">
          VibeBuild
        </h1>
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
          {hasSettings === false && (
            <p className="mt-4 text-center text-xs text-slate-500">
              Демо-режим: запусти приложение через <code>yarn tauri dev</code> и настрой
              провайдера в ⚙, чтобы генерировать настоящие постройки.
            </p>
          )}
        </form>
      </div>

      {/* Generation status overlay */}
      {phase === "generating" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center">
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#0b0e14]/90 px-5 py-3 text-sm text-slate-300">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
            {status || "Работаю…"}
          </div>
        </div>
      )}

      {/* Error overlay (validation or provider failure) */}
      {phase === "error" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-6">
          <div className="max-w-lg rounded-xl border border-red-400/20 bg-[#1a1114]/95 p-5">
            <div className="mb-3 font-semibold text-red-400">Не получилось построить</div>
            <ul className="mb-4 max-h-56 space-y-1 overflow-auto text-sm text-slate-300">
              {errors.map((e, i) => (
                <li key={i}>• {e}</li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPhase("idle")}
                className="rounded-lg px-4 py-2 text-sm text-slate-400 transition hover:text-slate-200"
              >
                Назад
              </button>
              <button
                onClick={() => generate(prompt)}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-[#0b0e14] transition hover:bg-emerald-400"
              >
                Попробовать снова
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Warnings toast */}
      {phase === "ready" && warnings.length > 0 && (
        <div className="absolute bottom-3 left-3 z-10 max-w-sm rounded-lg border border-amber-400/20 bg-[#171310]/90 px-3 py-2 text-xs text-amber-200/80">
          {warnings.map((w, i) => (
            <div key={i}>⚠ {w}</div>
          ))}
        </div>
      )}

      {/* Materials panel */}
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

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => setHasSettings(true)}
      />
    </div>
  );
}
