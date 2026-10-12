import { useEffect, useState } from "react";
import { getSettings, saveSettings, type ProviderKind } from "../lib/llm/client";

const PROVIDER_DEFAULTS: Record<ProviderKind, { baseUrl: string; model: string; keyHint: string }> = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    keyHint: "sk-… (для Ollama/локальных серверов ключ можно оставить пустым)",
  },
  anthropic: {
    baseUrl: "https://api.anthropic.com",
    model: "claude-sonnet-4-5",
    keyHint: "sk-ant-…",
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
  const [provider, setProvider] = useState<ProviderKind>("openai");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

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

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await saveSettings({ provider, baseUrl, model: model.trim(), apiKey: apiKey.trim() });
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
          <h2 className="text-lg font-semibold text-white">Настройки провайдера</h2>
          <button onClick={onClose} className="text-neutral-500 transition hover:text-white">
            ✕
          </button>
        </div>

        <label className={LABEL}>Провайдер</label>
        <select
          value={provider}
          onChange={(e) => applyProviderDefaults(e.currentTarget.value as ProviderKind)}
          className={FIELD + " bg-neutral-900"}
        >
          <option value="openai">OpenAI-совместимый (OpenAI / DeepSeek / OpenRouter / Ollama)</option>
          <option value="anthropic">Anthropic (Claude)</option>
        </select>

        <label className={LABEL}>Base URL</label>
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.currentTarget.value)}
          placeholder={PROVIDER_DEFAULTS[provider].baseUrl}
          className={FIELD}
        />

        <label className={LABEL}>Модель</label>
        <input
          value={model}
          onChange={(e) => setModel(e.currentTarget.value)}
          placeholder={PROVIDER_DEFAULTS[provider].model}
          className={FIELD}
        />

        <label className={LABEL}>API-ключ</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.currentTarget.value)}
          placeholder={PROVIDER_DEFAULTS[provider].keyHint}
          className={FIELD + " mb-4"}
        />

        {error && <p className="mb-3 text-sm text-neutral-200">⚠ {error}</p>}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-neutral-400 transition hover:text-white"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-950 transition hover:bg-neutral-300 disabled:opacity-50"
          >
            {saving ? "Сохраняю…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}