import { useEffect, useRef, useState } from "react";
import { getSettings, saveSettings, type ProviderKind } from "../lib/llm/client";
import { getLang, setLang, type Lang } from "../lib/i18n";
import { useLang } from "../lib/useLang";

const PROVIDER_DEFAULTS: Record<ProviderKind, { baseUrl: string; model: string }> = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-6-luna",
  },
  anthropic: {
    baseUrl: "https://api.anthropic.com",
    model: "claude-opus-5-5",
  },
};

const FIELD =
  "mb-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-neutral-600 focus:border-white/60";
const LABEL = "mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500";

export function SettingsDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { lang, L } = useLang();
  const [provider, setProvider] = useState<ProviderKind>("openai");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  /** Cancel semantics: a live language change reverts unless settings were saved. */
  const langAtOpenRef = useRef<Lang>("ru");
  const savedRef = useRef(false);

  useEffect(() => {
    if (open) {
      savedRef.current = false;
      langAtOpenRef.current = getLang();
    }
  }, [open]);

  useEffect(() => {
    if (!open || loaded) return;
    setLoaded(true);
    getSettings()
      .then((s) => {
        if (s) {
          setProvider(s.provider);
          setBaseUrl(s.baseUrl);
          setModel(s.model);
          setApiKey(s.apiKey);
          if (s.language === "ru" || s.language === "en") setLang(s.language);
        } else {
          applyProviderDefaults("openai");
        }
      })
      .catch(() => applyProviderDefaults("openai"));
  }, [open, loaded]);

  function applyProviderDefaults(kind: ProviderKind) {
    setProvider(kind);
    setBaseUrl(PROVIDER_DEFAULTS[kind].baseUrl);
    setModel(PROVIDER_DEFAULTS[kind].model);
  }

  if (!open) return null;

  /** ✕ / «Отмена»: drop a language switch that was not saved. */
  function handleClose() {
    if (!savedRef.current) setLang(langAtOpenRef.current);
    onClose();
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await saveSettings({ provider, baseUrl, model: model.trim(), apiKey: apiKey.trim(), language: lang });
      savedRef.current = true;
      onSaved();
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-neutral-900 p-5 shadow-2xl shadow-black/60">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{L.settingsTitle}</h2>
          <button onClick={handleClose} className="text-neutral-500 transition hover:text-white">
            ✕
          </button>
        </div>

        {/* Language first: applies live, so the rest of the dialog translates instantly. */}
        <label className={LABEL}>{L.languageLabel}</label>
        <select
          value={lang}
          onChange={(e) => setLang(e.currentTarget.value as Lang)}
          className={FIELD + " bg-neutral-900"}
        >
          <option value="ru">Русский</option>
          <option value="en">English</option>
        </select>

        <label className={LABEL}>{L.provider}</label>
        <select
          value={provider}
          onChange={(e) => applyProviderDefaults(e.currentTarget.value as ProviderKind)}
          className={FIELD + " bg-neutral-900"}
        >
          <option value="openai">{L.providerOpenai}</option>
          <option value="anthropic">{L.providerAnthropic}</option>
        </select>

        <label className={LABEL}>{L.baseUrl}</label>
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.currentTarget.value)}
          placeholder={PROVIDER_DEFAULTS[provider].baseUrl}
          className={FIELD}
        />

        <label className={LABEL}>{L.model}</label>
        <input
          value={model}
          onChange={(e) => setModel(e.currentTarget.value)}
          placeholder={PROVIDER_DEFAULTS[provider].model}
          className={FIELD}
        />

        <label className={LABEL}>{L.apiKey}</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.currentTarget.value)}
          placeholder={provider === "openai" ? L.keyHintOpenai : "sk-ant-…"}
          className={FIELD + " mb-4"}
        />

        {error && <p className="mb-3 text-sm text-neutral-200">⚠ {error}</p>}

        <div className="flex justify-end gap-2">
          <button
            onClick={handleClose}
            className="rounded-lg px-4 py-2 text-sm text-neutral-400 transition hover:text-white"
          >
            {L.cancel}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-950 transition hover:bg-neutral-300 disabled:opacity-50"
          >
            {saving ? L.saving : L.saveSettings}
          </button>
        </div>
      </div>
    </div>
  );
}
