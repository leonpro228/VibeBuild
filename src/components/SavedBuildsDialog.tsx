import { useEffect, useState } from "react";
import {
  deleteBuild,
  listBuilds,
  loadBuild,
  type SavedBuild,
  type SavedBuildMeta,
} from "../lib/storage";
import { format } from "../lib/i18n";
import { useLang } from "../lib/useLang";

const GHOST_SMALL =
  "rounded-lg border border-white/10 px-2 py-1 text-xs text-neutral-400 transition hover:border-white/40 hover:text-white";

function formatDate(ms: number, lang: string): string {
  return new Date(ms).toLocaleString(lang === "ru" ? "ru-RU" : "en-US", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SavedBuildsDialog({
  open,
  onClose,
  onLoad,
}: {
  open: boolean;
  onClose: () => void;
  onLoad: (saved: SavedBuild) => void;
}) {
  const { lang, L } = useLang();
  const [items, setItems] = useState<SavedBuildMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    listBuilds()
      .then(setItems)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  async function handleLoad(id: string) {
    setBusyId(id);
    setError(null);
    try {
      onLoad(await loadBuild(id));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(format(L.confirmDelete, { name }))) return;
    setBusyId(id);
    setError(null);
    try {
      await deleteBuild(id);
      setItems((cur) => cur.filter((i) => i.id !== id));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-neutral-900 p-5 shadow-2xl shadow-black/60">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{L.myBuildsTitle}</h2>
          <button onClick={onClose} className="text-neutral-500 transition hover:text-white">
            ✕
          </button>
        </div>

        {error && <p className="mb-3 text-sm text-neutral-200">⚠ {error}</p>}

        {loading ? (
          <p className="py-6 text-center text-sm text-neutral-500">{L.loading}</p>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-500">{L.savedEmpty}</p>
        ) : (
          <ul className="mb-1 max-h-80 space-y-2 overflow-y-auto pr-1">
            {items.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-white" title={m.name}>
                    {m.name}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {m.size.width}×{m.size.height}×{m.size.depth} · {formatDate(m.savedAt, lang)}
                  </div>
                </div>
                <button
                  onClick={() => handleLoad(m.id)}
                  disabled={busyId === m.id}
                  className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-neutral-950 transition hover:bg-neutral-300 disabled:opacity-50"
                >
                  {busyId === m.id ? "…" : L.open}
                </button>
                <button
                  onClick={() => handleDelete(m.id, m.name)}
                  disabled={busyId === m.id}
                  title={L.deleteTitle}
                  className={GHOST_SMALL}
                >
                  🗑
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
