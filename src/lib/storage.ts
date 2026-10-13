import { invoke } from "@tauri-apps/api/core";
import type { Build } from "./build/types";

export interface SavedBuildMeta {
  id: string;
  name: string;
  /** Unix epoch milliseconds. */
  savedAt: number;
  size: Build["size"];
}

export interface SavedBuild extends SavedBuildMeta {
  build: Build;
}

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// ---- localStorage fallback (plain-browser dev / ?demo) ----

type LsEntry = SavedBuild;

const LS_KEY = "vibebuild.savedBuilds";

function lsRead(): LsEntry[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const parsed = raw ? (JSON.parse(raw) as LsEntry[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function lsWrite(entries: LsEntry[]): void {
  localStorage.setItem(LS_KEY, JSON.stringify(entries));
}

function lsUnique(id: string): string {
  const taken = new Set(lsRead().map((e) => e.id));
  if (!taken.has(id)) return id;
  let n = 2;
  while (taken.has(`${id}-${n}`)) n++;
  return `${id}-${n}`;
}

function slugify(name: string): string {
  const collapsed = name
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return collapsed || "build";
}

/** Saves the canonical build; returns its menu metadata. */
export async function saveBuild(build: Build): Promise<SavedBuildMeta> {
  if (isTauri()) {
    return invoke<SavedBuildMeta>("save_build", { build });
  }
  const name = build.name.trim() || "Без названия";
  const entry: LsEntry = {
    id: lsUnique(slugify(name)),
    name,
    savedAt: Date.now(),
    size: build.size,
    build,
  };
  lsWrite([...lsRead(), entry]);
  const { build: _omit, ...meta } = entry;
  return meta;
}

export async function listBuilds(): Promise<SavedBuildMeta[]> {
  if (isTauri()) {
    return invoke<SavedBuildMeta[]>("list_builds");
  }
  return lsRead()
    .map(({ build: _omit, ...meta }) => meta)
    .sort((a, b) => b.savedAt - a.savedAt);
}

export async function loadBuild(id: string): Promise<SavedBuild> {
  if (isTauri()) {
    return invoke<SavedBuild>("load_build", { id });
  }
  const entry = lsRead().find((e) => e.id === id);
  if (!entry) throw new Error("Постройка не найдена");
  return entry;
}

export async function deleteBuild(id: string): Promise<void> {
  if (isTauri()) {
    return invoke("delete_build", { id });
  }
  lsWrite(lsRead().filter((e) => e.id !== id));
}
