import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Viewer3D } from "./components/Viewer3D";
import { SettingsDialog } from "./components/SettingsDialog";
import { SavedBuildsDialog } from "./components/SavedBuildsDialog";
import { StepsPanel } from "./components/StepsPanel";
import { demoBuild, materials } from "./lib/build/demo";
import { buildSteps, type Step } from "./lib/build/instructions";
import { validateLLMResponse } from "./lib/build/validate";
import { getSettings, streamCompletion, StreamError, CANCELLED, type ProviderSettings } from "./lib/llm/client";
import { buildRepairPrompt, buildSystemPrompt, buildUserPrompt } from "./lib/palette/prompt";
import { saveBuild, type SavedBuild } from "./lib/storage";
import type { Build } from "./lib/build/types";

type Phase = "idle" | "generating" | "ready" | "error";

/** One failure to show in the error overlay; `hint` is a plain-language next step. */
type ErrorItem = { message: string; hint?: string };

const SUGGESTIONS = ["Замок 10×10", "Домик 5×5", "Башня волшебника", "Мост через реку"];

const DEMO_STEPS = [
  "Демо-режим (LLM не настроен)",
  "Разбираю запрос…",
  "Планирую структуру…",
  "Генерирую слои…",
  "Собираю сцену…",
];

const GHOST_BUTTON =
  "rounded-lg border border-white/10 px-2.5 py-1.5 text-sm text-neutral-400 transition hover:border-white/40 hover:text-white";
const PRIMARY_BUTTON =
  "rounded-lg bg-white px-4 py-1.5 text-sm font-medium text-neutral-950 transition hover:bg-neutral-300";
const INPUT =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm outline-none placeholder:text-neutral-500 focus:border-white/40";

const VALIDATION_HINT =
  "Модель дважды вернула ответ вне формата. Попробуйте переформулировать запрос или уменьшить постройку.";

/** Plain-language next step for a structured provider failure (kind from Rust). */
function streamHint(kind: string, message: string): string {
  if (kind === "http") {
    const status = /HTTP (\d{3})/.exec(message)?.[1];
    if (status === "401" || status === "403") {
      return "Похоже, API-ключ не принят — проверьте ключ и base URL в ⚙ Настройках.";
    }
    if (status === "404") {
      return "Проверьте base URL и название модели в ⚙ Настройках.";
    }
    if (status === "429") {
      return "Лимит запросов провайдера — подождите немного и повторите.";
    }
    if (status?.startsWith("5")) {
      return "Провайдер временно недоступен — повторите позже.";
    }
    return "Проверьте настройки провайдера в ⚙ Настройках.";
  }
  if (kind === "network") {
    return "Проверьте подключение к интернету и адрес провайдера в ⚙ Настройках.";
  }
  if (kind === "protocol") {
    return "Провайдер вернул ответ не по протоколу — попробуйте повторить.";
  }
  return "Проверьте настройки провайдера в ⚙ Настройках.";
}

/** clipboard API may be unavailable in some webviews — execCommand fallback. */
async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

export default function App() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [prompt, setPrompt] = useState("");
  const [build, setBuild] = useState<Build | null>(null);
  const [focusY, setFocusY] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [errors, setErrors] = useState<ErrorItem[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [hasSettings, setHasSettings] = useState<boolean | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const generationId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const steps = useMemo<Step[]>(() => (build ? buildSteps(build) : []), [build]);

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
    async (
      system: string,
      user: string,
      label: string,
      signal?: AbortSignal,
      genId?: number,
    ): Promise<string> => {
      setStatus(label);
      return streamCompletion(
        system,
        user,
        (_chunk, total) => {
          setStatus(`${label} ${total} символов…`);
        },
        signal,
        genId,
      );
    },
    [],
  );

  const generate = useCallback(
    async (text: string, instantDemo = false) => {
      if (!text.trim()) return;
      timers.current.forEach(clearTimeout);
      timers.current = [];
      const id = ++generationId.current;
      // A previous stream (if any) is dropped for real: abort rejects it and
      // Rust closes the HTTP connection via cancel_generation.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setPrompt(text);
      setBuild(null);
      setFocusY(null);
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
        let raw = await streamOnce(system, buildUserPrompt(text), "Генерирую постройку…", controller.signal, id);
        if (id !== generationId.current) return;

        setStatus("Проверяю ответ…");
        let result = validateLLMResponse(raw);
        if (!result.ok) {
          // One auto-repair round-trip with precise error feedback.
          setStatus("Исправляю ошибки генерации…");
          raw = await streamOnce(system, buildRepairPrompt(text, raw, result.errors), "Исправляю…", controller.signal, id);
          if (id !== generationId.current) return;
          setStatus("Проверяю ответ…");
          result = validateLLMResponse(raw);
        }

        if (!result.ok) {
          setErrors(result.errors.map((m) => ({ message: m, hint: VALIDATION_HINT })));
          setPhase("error");
          return;
        }
        setStatus("");
        setWarnings(result.warnings);
        setBuild(result.build);
        setPhase("ready");
      } catch (e) {
        // A stop/supersede is not an error: whoever aborted owns the phase.
        if (e instanceof StreamError && e.kind === CANCELLED) return;
        if (id !== generationId.current) return;
        if (e instanceof StreamError) {
          setErrors([{ message: e.message, hint: streamHint(e.kind, e.message) }]);
        } else {
          setErrors([{ message: e instanceof Error ? e.message : String(e) }]);
        }
        setPhase("error");
      }
    },
    [runDemo, streamOnce],
  );

  /** Saves the current build (Tauri config dir, localStorage in browser dev). */
  const saveCurrent = useCallback(async () => {
    if (!build || saveState === "saving") return;
    setSaveState("saving");
    try {
      await saveBuild(build);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch (e) {
      setSaveState("idle");
      const message = e instanceof Error ? e.message : String(e);
      setNotice(`Не удалось сохранить: ${message}`);
      setTimeout(() => setNotice(null), 5000);
    }
  }, [build, saveState]);

  /** Loads a saved build; cancels any generation still in flight. */
  const loadSaved = useCallback((saved: SavedBuild) => {
    if (!saved?.build || !saved.build.size || !Array.isArray(saved.build.layers)) {
      throw new Error("Файл постройки повреждён");
    }
    // Re-run through the normal pipeline: canonical rows are string[][] (the
    // validator calls that shape "grid"), and this also catches blocks that
    // dropped out of the palette since the build was saved.
    const raw = JSON.stringify({
      name: saved.build.name,
      size: saved.build.size,
      layers: saved.build.layers.map(({ y, rows }) => ({ y, grid: rows })),
    });
    const result = validateLLMResponse(raw);
    if (!result.ok) {
      throw new Error(`Постройка не прошла валидацию: ${result.errors[0]}`);
    }
    timers.current.forEach(clearTimeout);
    timers.current = [];
    generationId.current += 1;
    setSavedOpen(false);
    setPrompt(result.build.name);
    setFocusY(null);
    setErrors([]);
    setWarnings(result.warnings);
    setStatus("");
    setBuild(result.build);
    setPhase("ready");
  }, []);

  /** Stops the in-flight generation (real Rust-side abort) and goes idle. */
  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    timers.current.forEach(clearTimeout);
    timers.current = [];
    generationId.current += 1;
    setStatus("");
    setPhase("idle");
  }, []);

  /** Back to the welcome screen from the viewport. */
  const goHome = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    generationId.current += 1;
    setFocusY(null);
    setStatus("");
    setPhase("idle");
  }, []);

  // Welcome prompt: the textarea grows with its content (multi-line prompts).
  useEffect(() => {
    const ta = textareaRef.current;
    if (phase !== "idle" || !ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [prompt, phase]);

  // Dev convenience: /?demo shows the fixture build immediately.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("demo")) {
      generate("Домик 5×5", true);
    }
  }, [generate]);

  // Instruction mode keyboard navigation: layers up/down, Esc = whole build.
  useEffect(() => {
    if (phase !== "ready" || steps.length === 0) return;
    const dirs: Record<string, 1 | -1> = {
      ArrowRight: 1,
      ArrowUp: 1,
      ArrowLeft: -1,
      ArrowDown: -1,
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setFocusY(null);
        return;
      }
      const dir = dirs[e.key];
      if (!dir) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      e.preventDefault();
      setFocusY((cur) => {
        const i = cur === null ? -1 : steps.findIndex((s) => s.y === cur);
        if (i < 0) return dir === 1 ? steps[0].y : steps[steps.length - 1].y;
        return steps[Math.min(steps.length - 1, Math.max(0, i + dir))].y;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, steps]);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-neutral-950 text-neutral-200">
      {/* 3D viewport: mounted in every phase, so it persists through the morph */}
      <div
        className={`absolute inset-x-0 bottom-0 transition-all duration-700 ease-out ${
          phase === "idle" ? "top-[55%] opacity-0" /* collapsed while idle */ : "top-14 opacity-100"
        }`}
      >
        <Viewer3D build={build} focusY={focusY} />
      </div>

      {/* Top bar (after generation starts) */}
      <header
        className={`absolute inset-x-0 top-0 z-10 flex h-14 items-center gap-3 border-b border-white/10 bg-neutral-950/80 px-4 backdrop-blur transition-opacity duration-500 ${
          phase === "idle" ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <span className="text-lg font-bold tracking-tight text-white">VibeBuild</span>
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
            className={INPUT}
          />
          <button type="submit" className={PRIMARY_BUTTON}>
            Построить
          </button>
        </form>
        {phase === "ready" && build && (
          <button
            onClick={saveCurrent}
            disabled={saveState === "saving"}
            title="Сохранить постройку"
            className={GHOST_BUTTON + " shrink-0"}
          >
            {saveState === "saving" ? "Сохраняю…" : saveState === "saved" ? "Сохранено ✓" : "💾 Сохранить"}
          </button>
        )}
        <button onClick={() => setSavedOpen(true)} title="Мои постройки" className={GHOST_BUTTON}>
          📁
        </button>
        <button onClick={() => setSettingsOpen(true)} title="Настройки провайдера" className={GHOST_BUTTON}>
          ⚙
        </button>
      </header>

      {/* Welcome screen: greeting + centered prompt (fades out into the viewport) */}
      <div
        className={`absolute inset-0 z-20 flex flex-col items-center justify-center px-6 transition-all duration-700 ease-out ${
          phase === "idle" ? "opacity-100" : "pointer-events-none -translate-y-24 opacity-0"
        }`}
      >
        <div className="absolute right-4 top-4 flex gap-2">
          <button onClick={() => setSavedOpen(true)} title="Мои постройки" className={GHOST_BUTTON}>
            📁 Мои постройки
          </button>
          {/* Always reachable: settings may be saved but broken (bad key). */}
          <button onClick={() => setSettingsOpen(true)} title="Настройки провайдера" className={GHOST_BUTTON}>
            ⚙ Настроить провайдера
          </button>
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">VibeBuild</h1>
        <form
          className="mt-8 w-full max-w-xl"
          onSubmit={(e) => {
            e.preventDefault();
            generate(prompt);
          }}
        >
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-2 shadow-2xl shadow-black/60 transition focus-within:border-white/40">
            <textarea
              ref={textareaRef}
              rows={1}
              value={prompt}
              onChange={(e) => setPrompt(e.currentTarget.value)}
              onKeyDown={(e) => {
                // Enter sends, Shift+Enter makes a new line.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  generate(prompt);
                }
              }}
              placeholder="Построй замок 10×10…"
              autoFocus
              className="max-h-40 w-full resize-none overflow-y-auto bg-transparent px-3 py-2 outline-none placeholder:text-neutral-500"
            />
            <button
              type="submit"
              className="shrink-0 rounded-xl bg-white px-5 py-2.5 font-medium text-neutral-950 transition hover:bg-neutral-300"
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
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-neutral-400 transition hover:border-white/40 hover:text-white"
              >
                {s}
              </button>
            ))}
          </div>
          {hasSettings === false && (
            <p className="mt-4 text-center text-xs text-neutral-500">
              Демо-режим: запусти приложение через <code>yarn tauri dev</code> и настрой
              провайдера в ⚙, чтобы генерировать настоящие постройки.
            </p>
          )}
        </form>
      </div>

      {/* Generation status overlay with a way out */}
      {phase === "generating" && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3">
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-neutral-950/90 px-5 py-3 text-sm text-neutral-300">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            {status || "Работаю…"}
          </div>
          <button
            onClick={stopGeneration}
            className="rounded-lg border border-white/40 bg-neutral-950/90 px-4 py-2 text-sm text-neutral-200 backdrop-blur transition hover:bg-neutral-900"
          >
            ⏹ Остановить
          </button>
        </div>
      )}

      {/* Back to the welcome screen */}
      {phase === "ready" && (
        <button
          onClick={goHome}
          className="absolute left-3 top-16 z-20 rounded-lg border border-white/40 bg-neutral-950/70 px-2.5 py-1.5 text-sm text-white backdrop-blur transition hover:bg-neutral-900"
        >
          ← Назад
        </button>
      )}

      {/* Error overlay (validation or provider failure) */}
      {phase === "error" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-6">
          <div className="max-w-lg rounded-xl border border-white/15 bg-neutral-900/95 p-5 shadow-2xl shadow-black/60">
            <div className="mb-3 font-semibold text-white">Не получилось построить</div>
            <ul className="mb-3 max-h-56 space-y-1 overflow-auto text-sm text-neutral-300">
              {errors.map((e, i) => (
                <li key={i}>• {e.message}</li>
              ))}
            </ul>
            {/* Plain-language next steps; deduplicated across items. */}
            {[...new Set(errors.map((e) => e.hint).filter((h): h is string => !!h))].map((hint) => (
              <p key={hint} className="mb-2 text-xs leading-relaxed text-neutral-500">
                → {hint}
              </p>
            ))}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPhase("idle")}
                className="rounded-lg px-4 py-2 text-sm text-neutral-400 transition hover:text-white"
              >
                Назад
              </button>
              <button
                onClick={() => {
                  copyText(errors.map((e) => e.message).join("\n")).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  });
                }}
                className={GHOST_BUTTON + " px-4 py-2"}
              >
                {copied ? "Скопировано ✓" : "Скопировать текст"}
              </button>
              {/* Direct path to fixing a bad API key without leaving the error. */}
              <button
                onClick={() => setSettingsOpen(true)}
                className={GHOST_BUTTON + " px-4 py-2"}
              >
                ⚙ Настройки
              </button>
              <button onClick={() => generate(prompt)} className={PRIMARY_BUTTON + " py-2"}>
                Попробовать снова
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Warnings toast */}
      {phase === "ready" && warnings.length > 0 && (
        <div className="absolute bottom-3 left-3 z-10 max-w-sm rounded-lg border border-white/10 bg-neutral-900/90 px-3 py-2 text-xs text-neutral-400">
          {warnings.map((w, i) => (
            <div key={i}>⚠ {w}</div>
          ))}
        </div>
      )}

      {/* Notice toast (e.g. save failure) */}
      {notice && (
        <div className="absolute bottom-3 left-3 z-30 max-w-sm rounded-lg border border-white/15 bg-neutral-900/95 px-3 py-2 text-xs text-neutral-200">
          {notice}
        </div>
      )}

      {/* Right column: instruction steps + materials */}
      {phase === "ready" && build && (
        <aside className="absolute bottom-3 right-3 top-16 z-10 flex w-64 flex-col gap-3">
          <StepsPanel steps={steps} focusY={focusY} onSelect={setFocusY} />
          <div className="flex-none rounded-xl border border-white/10 bg-neutral-950/85 p-3 backdrop-blur">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Материалы
            </div>
            <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
              {materials(build).map(({ id, count }) => (
                <li key={id} className="flex justify-between gap-2">
                  <span className="truncate text-neutral-300">{id}</span>
                  <span className="text-neutral-500">{count}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      )}

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => setHasSettings(true)}
      />
      <SavedBuildsDialog open={savedOpen} onClose={() => setSavedOpen(false)} onLoad={loadSaved} />
    </div>
  );
}