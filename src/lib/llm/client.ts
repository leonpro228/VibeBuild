import { Channel, invoke } from "@tauri-apps/api/core";

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
}

export function getSettings(): Promise<ProviderSettings | null> {
  return invoke<ProviderSettings | null>("get_settings");
}

export function saveSettings(settings: ProviderSettings): Promise<void> {
  return invoke("save_settings", { settings });
}

/**
 * Streams one LLM completion. Resolves with the full raw text on success,
 * rejects with an error message on failure.
 */
export function streamCompletion(
  system: string,
  user: string,
  onToken?: (chunk: string, totalLength: number) => void,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let raw = "";
    const channel = new Channel<LlmEvent>();
    channel.onmessage = (event) => {
      switch (event.type) {
        case "token":
          raw += event.data;
          onToken?.(event.data, raw.length);
          break;
        case "done":
          resolve(raw);
          break;
        case "error":
          reject(new StreamError(event.data));
          break;
      }
    };
    // Command-level failure (no settings, broken settings file…): arrives as
    // a plain string rejection, not through the channel — treat as "config".
    invoke("generate_build", { system, user, onEvent: channel }).catch((e) => {
      reject(
        typeof e === "string"
          ? new StreamError({ kind: "config", message: e })
          : e instanceof Error
            ? new StreamError({ kind: "config", message: e.message })
            : e,
      );
    });
  });
}
