import { getLocale, languageUrl, t } from './i18n.js';

const escape = (text) => String(text).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const attributes = ['aria-label', 'title', 'content'];

export function localizeDocument(document, locale = getLocale()) {
  for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = t(element.dataset.i18n, {}, locale);
  for (const element of document.querySelectorAll('[data-i18n-html]')) element.innerHTML = t(element.dataset.i18nHtml, {}, locale);
  for (const attribute of attributes) {
    for (const element of document.querySelectorAll(`[data-i18n-${attribute}]`)) {
      element.setAttribute(attribute, t(element.getAttribute(`data-i18n-${attribute}`), {}, locale));
    }
  }
  document.documentElement.lang = locale;
  document.documentElement.dataset.locale = locale;
}

export function localizeHtml(html, locale, base = '/') {
  let output = html.replace(/<html\b[^>]*>/, (tag) => setAttribute(setAttribute(tag, 'lang', locale), 'data-content-locale', locale));
  for (const [attribute, raw] of [['data-i18n', false], ['data-i18n-html', true]]) {
    const pattern = new RegExp(`<([a-z][\\w-]*)\\b([^>]*\\s${attribute}="([^"]+)"[^>]*)>[\\s\\S]*?<\\/\\1>`, 'g');
    output = output.replace(pattern, (match, tag, attrs, key) => `<${tag}${attrs}>${raw ? t(key, {}, locale) : escape(t(key, {}, locale))}</${tag}>`);
  }
  for (const attribute of attributes) {
    output = output.replace(new RegExp(`<[^>]+\\sdata-i18n-${attribute}="([^"]+)"[^>]*>`, 'g'),
      (tag, key) => setAttribute(tag, attribute, t(key, {}, locale)));
  }
  output = output.replace(/<a\b[^>]*\bdata-language-switch\b[^>]*>[\s\S]*?<\/a>/g, (tag) => {
    const target = locale === 'ru' ? 'en' : 'ru';
    let translated = setAttribute(tag, 'href', `${base}${target}/?view=card`);
    translated = setAttribute(translated, 'aria-label', t('language.switch', {}, locale));
    translated = setAttribute(translated, 'title', t('language.switch', {}, locale));
    translated = setAttribute(translated, 'lang', target);
    return translated.replace(/>[^<]*<\/a>$/, `>${locale.toUpperCase()}</a>`);
  });
  output = output.replace(/<a\b[^>]*\bid="card-download"[^>]*>/, (tag) => {
    const translated = setAttribute(tag, 'href', `${base}business-card${locale === 'en' ? '-en' : ''}.pdf`);
    return setAttribute(translated, 'download', `evgeny-ashroev-business-card${locale === 'en' ? '-en' : ''}.pdf`);
  });
  return output;
}

function setAttribute(tag, name, value) {
  const pattern = new RegExp(`\\s${name}="[^"]*"`);
  const attribute = ` ${name}="${escape(value)}"`;
  return pattern.test(tag) ? tag.replace(pattern, attribute) : tag.replace(/(?=\/?>)/, attribute);
}

export function syncLanguageLinks(document, href, base, locale = getLocale()) {
  const target = locale === 'ru' ? 'en' : 'ru';
  for (const link of document.querySelectorAll('[data-language-switch]')) {
    link.textContent = locale.toUpperCase();
    link.href = languageUrl(href, target, base);
    link.setAttribute('aria-label', t('language.switch', {}, locale));
    link.setAttribute('title', t('language.switch', {}, locale));
    link.lang = target;
  }
}
