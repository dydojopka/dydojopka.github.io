import { getLocale, languageUrl, LOCALE_STORAGE_KEY, resolveLocale, setLocale, subscribeLocale } from './i18n.js';
import { localizeDocument, syncLanguageLinks } from './localize-html.js';

export function createLanguageControls({ window, document, base = '/', renderCard }) {
  const events = new AbortController();
  let stored;
  try { stored = window.localStorage.getItem(LOCALE_STORAGE_KEY); } catch { /* Storage is optional. */ }
  setLocale(resolveLocale({ href: window.location.href, base, stored, browserLanguage: window.navigator.language }));

  function syncLinks() { syncLanguageLinks(document, window.location.href, base); }
  function paint() {
    const locale = getLocale();
    localizeDocument(document, locale);
    if (document.documentElement.dataset.contentLocale !== locale) {
      const article = document.querySelector('.business-card');
      const focusId = article?.contains(document.activeElement) ? document.activeElement.id : undefined;
      if (article) article.outerHTML = renderCard(locale);
      document.documentElement.dataset.contentLocale = locale;
      if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
    }
    const download = document.querySelector('#card-download');
    download.href = `${base}business-card${locale === 'en' ? '-en' : ''}.pdf`;
    download.download = `evgeny-ashroev-business-card${locale === 'en' ? '-en' : ''}.pdf`;
    syncLinks();
  }
  const unsubscribeLocale = subscribeLocale(paint);
  for (const link of document.querySelectorAll('[data-language-switch]')) {
    link.addEventListener('click', (event) => {
      if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      event.stopPropagation();
      const locale = getLocale() === 'ru' ? 'en' : 'ru';
      window.history.replaceState(window.history.state, '', languageUrl(window.location.href, locale, base));
      try { window.localStorage.setItem(LOCALE_STORAGE_KEY, locale); } catch { /* Storage is optional. */ }
      setLocale(locale);
    }, { signal: events.signal });
  }
  window.addEventListener('popstate', () => {
    // Scene/card history entries share the current language, including a choice
    // made on the printed card after the scene entry was recorded.
    window.history.replaceState(window.history.state, '', languageUrl(window.location.href, getLocale(), base));
    syncLinks();
  }, { signal: events.signal });
  paint();
  return { syncLinks, dispose() { unsubscribeLocale(); events.abort(); } };
}
