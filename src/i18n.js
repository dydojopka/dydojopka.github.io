import ru from './locales/ru.js';
import en from './locales/en.js';

export const LOCALES = ['ru', 'en'];
export const LOCALE_STORAGE_KEY = 'workstation-language';
const catalogs = { ru, en };
const listeners = new Set();
let current = 'ru';

export const getLocale = () => current;
export const getMessages = (locale = current) => catalogs[locale] ?? catalogs.en;

export function t(key, params = {}, locale = current) {
  const value = getMessages(locale)[key] ?? catalogs.en[key];
  if (typeof value !== 'string') throw new Error(`Missing translation: ${locale}.${key}`);
  return value.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(params, name) ? String(params[name]) : match);
}

export function setLocale(locale) {
  if (!LOCALES.includes(locale) || current === locale) return false;
  current = locale;
  for (const listener of listeners) listener(locale);
  return true;
}

export function subscribeLocale(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function localeFromUrl(href, base = '/') {
  const url = new URL(href);
  const explicit = url.searchParams.get('lang');
  if (LOCALES.includes(explicit)) return explicit;
  const path = url.pathname.startsWith(base) ? url.pathname.slice(base.length) : '';
  return /^(ru|en)(?:\/|$)/.exec(path)?.[1];
}

export function resolveLocale({ href, base = '/', stored, browserLanguage = 'en' }) {
  return localeFromUrl(href, base) ?? (LOCALES.includes(stored) ? stored : undefined)
    ?? (browserLanguage.toLowerCase().split(/[-_]/)[0] === 'ru' ? 'ru' : 'en');
}

export function languageUrl(href, locale, base = '/') {
  const url = new URL(href);
  url.pathname = `${base}${locale}/`;
  url.searchParams.delete('lang');
  return url.href;
}
