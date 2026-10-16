import { useSyncExternalStore } from "react";
import { getDict, getLang, subscribeLang, type Dict, type Lang } from "./i18n";

/**
 * Reactive i18n for components: re-renders when the language changes.
 * The language lives in the i18n store (switched live from the settings
 * dialog, persisted via settings.json / localStorage).
 */
export function useLang(): { lang: Lang; L: Dict } {
  const lang = useSyncExternalStore(subscribeLang, getLang);
  return { lang, L: getDict(lang) };
}
