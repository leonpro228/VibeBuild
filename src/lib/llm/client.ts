import { Channel, invoke } from "@tauri-apps/api/core";

export type LlmEvent =
  | { type: "token"; data: string }
  | { type: "done" }
  | { type: "error"; data: string };

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
          reject(new Error(event.data));
          break;
      }
    };
    invoke("generate_build", { system, user, onEvent: channel }).catch(reject);
  });
}
