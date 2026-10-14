/**
 * Local i18n entry point for AfuChat UI copy.
 *
 * This module is intentionally synchronous and bundled with the app. Page
 * labels, buttons, settings, onboarding copy, and alerts must use this API;
 * they must never depend on the Google-backed user-content translator.
 */

import {
  BUNDLED_UI_LANGUAGES,
  UI_LANGUAGE_REGISTRY,
  getUiLanguageDefinition,
  isBundledUiLanguage,
  localizeUi,
  registerUiTexts,
  setCurrentUiLanguage,
  subscribeUiTranslations,
  translateUi,
} from "./uiTranslations";

export type { UiLanguage, UiLanguageDefinition } from "./uiTranslations";
export {
  BUNDLED_UI_LANGUAGES,
  UI_LANGUAGE_REGISTRY,
  getUiLanguageDefinition,
  isBundledUiLanguage,
  localizeUi,
  registerUiTexts,
  subscribeUiTranslations,
};

/** Labels for the exact languages that are bundled and selectable in-app. */
export const LANG_LABELS: Record<string, string> = Object.fromEntries(
  UI_LANGUAGE_REGISTRY.map(({ code, label }) => [code, label]),
);

/** Translate a bundled UI key synchronously from the local catalog. */
export function t(
  text: string,
  language: string | null | undefined,
  params?: Record<string, string | number>,
): string {
  return translateUi(text, language, params);
}

function formatLocale(language: string | null | undefined): string {
  const normalized = language?.trim().toLowerCase().replace("_", "-") ?? "en";
  return normalized || "en";
}

/** Format counts using the active UI locale instead of device defaults. */
export function formatNumber(value: number, language?: string | null): string {
  return new Intl.NumberFormat(formatLocale(language)).format(value);
}

/** Format large counts compactly while respecting the active UI locale. */
export function formatCompactNumber(value: number, language?: string | null): string {
  return new Intl.NumberFormat(formatLocale(language), {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/** Format a date/time using the active UI locale. */
export function formatDate(
  value: Date | number | string,
  language?: string | null,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(formatLocale(language), options).format(date);
}

/** Format money with a currency code using the active UI locale. */
export function formatCurrency(
  value: number,
  currency: string,
  language?: string | null,
): string {
  return new Intl.NumberFormat(formatLocale(language), {
    style: "currency",
    currency,
  }).format(value);
}

/** Choose a singular/plural UI key with the locale's plural rules. */
export function tp(
  singular: string,
  plural: string,
  count: number,
  language: string | null | undefined,
  params: Record<string, string | number> = {},
): string {
  const category = new Intl.PluralRules(formatLocale(language)).select(count);
  return t(category === "one" ? singular : plural, language, { ...params, count });
}

/** Update the locale used by non-hook callers, such as transformed JSX. */
export function setLocale(language: string | null): void {
  setCurrentUiLanguage(language);
}