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
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#11151d] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Настройки провайдера</h2>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-200">
            ✕
          </button>
        </div>

        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
          Провайдер
        </label>
        <select
          value={provider}
          onChange={(e) => applyProviderDefaults(e.currentTarget.value as ProviderKind)}
          className="mb-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-400/50"
        >
          <option value="openai">OpenAI-совместимый (OpenAI / DeepSeek / OpenRouter / Ollama)</option>
          <option value="anthropic">Anthropic (Claude)</option>
        </select>

        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
          Base URL
        </label>
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.currentTarget.value)}
          placeholder={PROVIDER_DEFAULTS[provider].baseUrl}
          className="mb-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-slate-600 focus:border-emerald-400/50"
        />

        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
          Модель
        </label>
        <input
          value={model}
          onChange={(e) => setModel(e.currentTarget.value)}
          placeholder={PROVIDER_DEFAULTS[provider].model}
          className="mb-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-slate-600 focus:border-emerald-400/50"
        />

        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
          API-ключ
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.currentTarget.value)}
          placeholder={PROVIDER_DEFAULTS[provider].keyHint}
          className="mb-4 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-slate-600 focus:border-emerald-400/50"
        />

        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-slate-400 transition hover:text-slate-200"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-[#0b0e14] transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {saving ? "Сохраняю…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}
