import { Channel, invoke } from "@tauri-apps/api/core";
import type { Lang } from "../i18n";

/** Structured provider failure from Rust; `kind` drives the UI hint. */
export interface LlmError {
  /** "network" | "http" | "protocol" */
  kind: string;
  message: string;
}

export type LlmEvent =
  | { type: "token"; data: string }
  | { type: "done" }
  | { type: "error"; data: LlmError };

/** Error carrying the structured kind so the UI can pick the right hint. */
export class StreamError extends Error {
  readonly kind: string;

  constructor(err: LlmError) {
    super(err.message);
    this.name = "StreamError";
    this.kind = err.kind;
  }
}

export type ProviderKind = "openai" | "anthropic";

export interface ProviderSettings {
  provider: ProviderKind;
  /** Base URL; empty string = provider default. */
  baseUrl: string;
  model: string;
  apiKey: string;
  /** UI language ("ru" | "en"); default "ru" on the Rust side. */
  language: Lang;
}

export function getSettings(): Promise<ProviderSettings | null> {
  return invoke<ProviderSettings | null>("get_settings");
}

export function saveSettings(settings: ProviderSettings): Promise<void> {
  return invoke("save_settings", { settings });
}

/** Error kind the UI understands as "user stopped the generation". */
export const CANCELLED = "cancelled";

/**
 * Streams one LLM completion. Resolves with the full raw text on success,
 * rejects with a StreamError on failure. Aborting `signal` rejects with
 * kind "cancelled" and asks Rust to drop the stream (gen_id → registry);
 * events arriving after settle/close are ignored.
 */
export function streamCompletion(
  system: string,
  user: string,
  onToken?: (chunk: string, totalLength: number) => void,
  signal?: AbortSignal,
  genId?: number,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let raw = "";
    let closed = false;
    const channel = new Channel<LlmEvent>();

    const finish = (settle: () => void) => {
      if (closed) return;
      closed = true;
      signal?.removeEventListener("abort", onAbort);
      settle();
    };

    const onAbort = () => {
      finish(() => reject(new StreamError({ kind: CANCELLED, message: "Generation stopped" })));
      // Fire-and-forget: Rust drops the HTTP stream for this gen_id.
      if (genId !== undefined) invoke("cancel_generation", { genId }).catch(() => {});
    };
    signal?.addEventListener("abort", onAbort);

    channel.onmessage = (event) => {
      if (closed) return; // cancelled or superseded — ignore stale events
      switch (event.type) {
        case "token":
          raw += event.data;
          onToken?.(event.data, raw.length);
          break;
        case "done":
          finish(() => resolve(raw));
          break;
        case "error":
          finish(() => reject(new StreamError(event.data)));
          break;
      }
    };
    // Command-level failure (no settings, broken settings file…): arrives as
    // a plain string rejection, not through the channel — treat as "config".
    invoke("generate_build", { genId, system, user, onEvent: channel }).catch((e) => {
      finish(() =>
        reject(
          typeof e === "string"
            ? new StreamError({ kind: "config", message: e })
            : e instanceof Error
              ? new StreamError({ kind: "config", message: e.message })
              : e,
        ),
      );
    });
  });
}
