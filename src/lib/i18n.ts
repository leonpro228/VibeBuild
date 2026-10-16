/**
 * Minimal i18n: two dictionaries (ru / en), a tiny pub-sub store and a
 * `{placeholder}` formatter. React-free so pure modules (validate, storage)
 * can localize too; the React hook lives in useLang.ts.
 *
 * The UI language is a user setting (first field of the provider settings
 * dialog, stored in settings.json next to provider/key). Until settings load
 * it defaults to "ru" (the project's original language), remembered in
 * localStorage for plain-browser dev where Tauri settings are unavailable.
 */

export type Lang = "ru" | "en";

/** Russian is the shape source of truth; `en: Dict` must match it exactly. */
const ru = {
  // ---- welcome screen / top bar ----
  suggestions: ["Замок 10×10", "Домик 5×5", "Башня волшебника", "Мост через реку"],
  placeholderWelcome: "Построй замок 10×10…",
  placeholderTop: "Опиши постройку…",
  buildButton: "Построить",
  myBuildsButton: "📁 Мои постройки",
  setupProvider: "⚙ Настроить провайдера",
  demoHintBefore: "Демо-режим: запусти приложение через ",
  demoHintAfter: " и настрой провайдера в ⚙, чтобы генерировать настоящие постройки.",

  // ---- titles (tooltips) ----
  saveTitle: "Сохранить постройку",
  myBuildsTitle: "Мои постройки",
  settingsTitle: "Настройки провайдера",

  // ---- generation flow ----
  generating: "Генерирую постройку…",
  checking: "Проверяю ответ…",
  repairing: "Исправляю ошибки генерации…",
  repairingShort: "Исправляю…",
  chars: "{label} {n} символов…",
  working: "Работаю…",
  stop: "⏹ Остановить",
  demoPrompt: "Домик 5×5",
  demoSteps: [
    "Демо-режим (LLM не настроен)",
    "Разбираю запрос…",
    "Планирую структуру…",
    "Генерирую слои…",
    "Собираю сцену…",
  ],

  // ---- ready phase ----
  save: "💾 Сохранить",
  saving: "Сохраняю…",
  saved: "Сохранено ✓",
  back: "← Назад",
  materials: "Материалы",

  // ---- error overlay ----
  errorTitle: "Не получилось построить",
  copy: "Скопировать текст",
  copied: "Скопировано ✓",
  settingsButton: "⚙ Настройки",
  tryAgain: "Попробовать снова",
  backShort: "Назад",
  validationHint:
    "Модель дважды вернула ответ вне формата. Попробуйте переформулировать запрос или уменьшить постройку.",
  hint401: "Похоже, API-ключ не принят — проверьте ключ и base URL в ⚙ Настройках.",
  hint404: "Проверьте base URL и название модели в ⚙ Настройках.",
  hint429: "Лимит запросов провайдера — подождите немного и повторите.",
  hint5xx: "Провайдер временно недоступен — повторите позже.",
  hintHttp: "Проверьте настройки провайдера в ⚙ Настройках.",
  hintNetwork: "Проверьте подключение к интернету и адрес провайдера в ⚙ Настройках.",
  hintProtocol: "Провайдер вернул ответ не по протоколу — попробуйте повторить.",
  saveFailed: "Не удалось сохранить: {message}",
  corruptedFile: "Файл постройки повреждён",
  invalidSaved: "Постройка не прошла валидацию: {error}",

  // ---- steps panel ----
  instruction: "Инструкция",
  prevLayer: "Предыдущий слой",
  nextLayer: "Следующий слой",
  showAll: "Показать постройку целиком",
  level: "Уровень {n}",
  emptyBuild: "Постройка пуста",
  footerHint: "Клик по слою — режим сборки, ← → листают, Esc — целиком",

  // ---- layer preview ----
  northOnTop: "север — сверху",

  // ---- settings dialog ----
  languageLabel: "Язык / Language",
  provider: "Провайдер",
  providerOpenai: "OpenAI-совместимый (OpenAI / DeepSeek / OpenRouter / Ollama)",
  providerAnthropic: "Anthropic (Claude)",
  baseUrl: "Base URL",
  model: "Модель",
  apiKey: "API-ключ",
  keyHintOpenai: "sk-… (для Ollama/локальных серверов ключ можно оставить пустым)",
  cancel: "Отмена",
  saveSettings: "Сохранить",

  // ---- saved builds dialog ----
  loading: "Загружаю…",
  savedEmpty: "Пока нет сохранённых построек. Сгенерируйте постройку и нажмите «Сохранить».",
  open: "Открыть",
  deleteTitle: "Удалить",
  confirmDelete: "Удалить постройку «{name}»?",

  // ---- storage ----
  untitled: "Без названия",
  notFound: "Постройка не найдена",
};

export type Dict = typeof ru;

const en: Dict = {
  suggestions: ["A 10×10 castle", "A 5×5 house", "A wizard tower", "A bridge over a river"],
  placeholderWelcome: "Build a 10×10 castle…",
  placeholderTop: "Describe a build…",
  buildButton: "Build",
  myBuildsButton: "📁 My builds",
  setupProvider: "⚙ Set up provider",
  demoHintBefore: "Demo mode: launch the app via ",
  demoHintAfter: " and configure a provider in ⚙ to generate real builds.",

  saveTitle: "Save build",
  myBuildsTitle: "My builds",
  settingsTitle: "Provider settings",

  generating: "Generating build…",
  checking: "Checking the response…",
  repairing: "Fixing generation errors…",
  repairingShort: "Fixing…",
  chars: "{label} {n} characters…",
  working: "Working…",
  stop: "⏹ Stop",
  demoPrompt: "House 5×5",
  demoSteps: [
    "Demo mode (LLM not configured)",
    "Parsing the request…",
    "Planning the structure…",
    "Generating layers…",
    "Assembling the scene…",
  ],

  save: "💾 Save",
  saving: "Saving…",
  saved: "Saved ✓",
  back: "← Back",
  materials: "Materials",

  errorTitle: "Could not build",
  copy: "Copy text",
  copied: "Copied ✓",
  settingsButton: "⚙ Settings",
  tryAgain: "Try again",
  backShort: "Back",
  validationHint:
    "The model returned an off-format response twice. Try rephrasing the request or making the build smaller.",
  hint401: "The API key was likely rejected — check the key and base URL in ⚙ Settings.",
  hint404: "Check the base URL and the model name in ⚙ Settings.",
  hint429: "Provider rate limit — wait a moment and try again.",
  hint5xx: "The provider is temporarily unavailable — try again later.",
  hintHttp: "Check the provider settings in ⚙ Settings.",
  hintNetwork: "Check your internet connection and the provider address in ⚙ Settings.",
  hintProtocol: "The provider responded off-protocol — try again.",
  saveFailed: "Failed to save: {message}",
  corruptedFile: "Build file is corrupted",
  invalidSaved: "Build failed validation: {error}",

  instruction: "Instructions",
  prevLayer: "Previous layer",
  nextLayer: "Next layer",
  showAll: "Show the whole build",
  level: "Level {n}",
  emptyBuild: "The build is empty",
  footerHint: "Click a layer to focus it, ← → to flip through, Esc — whole build",

  northOnTop: "north — at the top",

  languageLabel: "Язык / Language",
  provider: "Provider",
  providerOpenai: "OpenAI-compatible (OpenAI / DeepSeek / OpenRouter / Ollama)",
  providerAnthropic: "Anthropic (Claude)",
  baseUrl: "Base URL",
  model: "Model",
  apiKey: "API key",
  keyHintOpenai: "sk-… (can be left empty for Ollama/local servers)",
  cancel: "Cancel",
  saveSettings: "Save",

  loading: "Loading…",
  savedEmpty: "No saved builds yet. Generate a build and press “Save”.",
  open: "Open",
  deleteTitle: "Delete",
  confirmDelete: "Delete build “{name}”?",

  untitled: "Untitled",
  notFound: "Build not found",
};

export const STRINGS: Record<Lang, Dict> = { ru, en };

// ---- tiny store ----

const LS_KEY = "vibebuild.lang";

function isLang(value: unknown): value is Lang {
  return value === "ru" || value === "en";
}

function initialLang(): Lang {
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (isLang(stored)) return stored;
  } catch {
    /* no localStorage — keep the default */
  }
  return "ru";
}

let current: Lang = initialLang();
const listeners = new Set<() => void>();

// Keep <html lang> in sync from the very start (no setLang call needed yet).
if (typeof document !== "undefined") document.documentElement.lang = current;

export function getLang(): Lang {
  return current;
}

export function getDict(lang: Lang = current): Dict {
  return STRINGS[lang];
}

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  try {
    localStorage.setItem(LS_KEY, lang);
  } catch {
    /* non-fatal */
  }
  document.documentElement.lang = lang;
  listeners.forEach((fn) => fn());
}

export function subscribeLang(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Substitutes `{key}` placeholders: format("{n} blocks", { n: 3 }) → "3 blocks". */
export function format(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

/** "1 блок / 2 блока / 5 блоков" vs English "1 block / 2 blocks". */
export function pluralBlocks(n: number, lang: Lang): string {
  if (lang === "en") return `${n} block${n === 1 ? "" : "s"}`;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} блок`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} блока`;
  return `${n} блоков`;
}
