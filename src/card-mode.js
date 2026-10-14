import { createLoadingScreen } from './loading-screen.js';

const HISTORY_KEY = 'workstationCard';
const FALLBACK_NOTICE = 'У сайта есть интерактивная 3D-сцена. Сейчас она недоступна — показана текстовая визитка.';

export function modeUrl(href, card) {
  const url = new URL(href);
  if (card) url.searchParams.set('view', 'card');
  else url.searchParams.delete('view');
  return url.href;
}

export function createCardMode({ window, document, loadRuntime, onModeChange = () => {} }) {
  const room = document.querySelector('#room');
  const card = document.querySelector('#card');
  const notice = document.querySelector('#card-notice');
  const button = document.querySelector('#card-return');
  const title = document.querySelector('#card-title');
  const loader = document.querySelector('#scene-loading');
  const themeButton = document.querySelector('#card-theme');
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  const events = new AbortController();
  let mode = 'loading';
  let reason = 'direct';
  let availability = 'loading';
  let runtime;
  let pending;
  let revision = 0;
  let scroll = 0;
  let destroyed = false;
  let manualTheme;
  let enteredScene = false;
  let admission;
  const loading = createLoadingScreen({
    window,
    document,
    onEnter() {
      if (!admission || admission.request !== revision || availability !== 'ready') return;
      const { value, options } = admission;
      admission = undefined;
      enterScene(value, { ...options, activateAudio: true });
    },
  });
  const owner = `${Date.now()}-${Math.random()}`;
  const ownEntry = () => window.history.state?.[HISTORY_KEY]?.owner === owner;

  function theme() {
    const value = manualTheme ?? (reason === 'fallback' || (reason === 'direct' && systemTheme.matches) ? 'dark' : 'paper');
    document.documentElement.dataset.cardTheme = value;
    const label = value === 'dark' ? 'Включить светлый лист' : 'Включить тёмную тему';
    themeButton.setAttribute('aria-label', label);
    themeButton.setAttribute('title', label);
  }
  function presentLoading() {
    mode = 'loading';
    runtime?.setVisible(false);
    room.hidden = room.inert = card.hidden = card.inert = true;
    loader.hidden = loader.inert = false;
    document.documentElement.dataset.mode = 'loading';
    onModeChange(mode);
    loading.setReady(false);
    loading.setVisible(true);
    window.scrollTo(0, 0);
    loader.focus({ preventScroll: true });
  }

  function service() {
    button.hidden = false;
    themeButton.hidden = false;
    button.disabled = availability === 'lost' || Boolean(pending);
    button.textContent = pending ? 'Загрузка 3D-сцены…' : 'К 3D-визитке';
    notice.hidden = reason === 'printer' && availability === 'ready';
    notice.textContent = pending ? 'Загружается интерактивная 3D-сцена.'
      : reason === 'fallback' ? FALLBACK_NOTICE + (availability === 'ready' ? ' Сцена снова доступна.' : '')
        : 'Текстовая визитка. Можно открыть интерактивную 3D-сцену.';
    document.documentElement.dataset.availability = availability;
  }
  function presentCard(nextReason, record = false) {
    if (destroyed) return;
    revision++;
    admission = undefined;
    loading.setVisible(false);
    loading.setReady(false);
    if (mode !== 'card' || reason !== nextReason) manualTheme = undefined;
    reason = nextReason;
    if (record) window.history.pushState({ ...window.history.state, [HISTORY_KEY]: { owner, reason } }, '', modeUrl(window.location.href, true));
    const wasScene = mode === 'scene';
    const focusedLoader = loader.contains(document.activeElement);
    mode = 'card';
    loader.hidden = loader.inert = true;
    runtime?.setVisible(false);
    room.hidden = room.inert = true;
    card.hidden = card.inert = false;
    document.documentElement.dataset.mode = 'card';
    onModeChange(mode);
    theme();
    service();
    if (wasScene || focusedLoader) {
      title.focus({ preventScroll: true });
      window.scrollTo(0, scroll);
    }
  }
  async function acquire() {
    if (runtime) return runtime;
    if (!pending) {
      availability = 'loading';
      loading.reset();
      pending = Promise.resolve().then(() => loadRuntime({
        onProgress: (stage) => loading.stage(stage),
        onCard: () => presentCard('printer', true),
        onLost() { availability = 'lost'; presentCard('fallback'); },
        onReady() { availability = 'ready'; service(); },
        onFailure(error) {
          availability = 'failed';
          presentCard('fallback');
          console.error('Не удалось отрисовать 3D-сцену.', error);
        },
      })).then((value) => {
        if (destroyed) { value.dispose(); throw new Error('Scene initialization cancelled'); }
        runtime = value;
        availability = 'ready';
        return value;
      }).catch((error) => {
        availability = 'failed';
        throw error;
      }).finally(() => { pending = undefined; service(); });
      service();
    }
    return pending;
  }
  function enterScene(value, { replace = false, replay = false, activateAudio = false } = {}) {
    try {
      if (replace) window.history.replaceState({ ...window.history.state, [HISTORY_KEY]: undefined }, '', modeUrl(window.location.href, false));
      if (mode === 'card') scroll = window.scrollY;
      enteredScene = true;
      mode = 'scene';
      loading.setVisible(false);
      loader.hidden = loader.inert = true;
      card.hidden = card.inert = true;
      room.hidden = room.inert = false;
      document.documentElement.dataset.mode = 'scene';
      onModeChange(mode);
      window.scrollTo(0, 0);
      value.setVisible(true);
      if (activateAudio) value.activateAudio();
      room.focus({ preventScroll: true });
      if (replay && value.printed) value.openSheet(() => presentCard('printer'));
      else value.returnSheet();
    } catch (error) {
      availability = 'failed';
      presentCard('fallback');
      console.error('Не удалось открыть 3D-сцену.', error);
    }
  }
  async function activateScene({ replace = false, replay = false } = {}) {
    if (availability === 'lost' || destroyed) return;
    const request = ++revision;
    if (mode === 'card') scroll = window.scrollY;
    if (!runtime || !enteredScene) presentLoading();
    try {
      const value = await acquire();
      if (request !== revision || destroyed) return;
      if (!enteredScene) {
        admission = { request, value, options: { replace, replay } };
        loading.setReady(true);
        return;
      }
      enterScene(value, { replace, replay });
    } catch (error) {
      if (request !== revision || destroyed) return;
      presentCard('fallback');
      console.error('Не удалось подготовить 3D-сцену.', error);
    }
  }
  function returnToScene() {
    if (pending || availability === 'lost') return;
    if (reason === 'printer' && ownEntry()) window.history.back();
    else activateScene({ replace: true });
  }
  button.addEventListener('click', returnToScene, { signal: events.signal });
  themeButton.addEventListener('click', () => {
    manualTheme = document.documentElement.dataset.cardTheme === 'dark' ? 'paper' : 'dark';
    theme();
  }, { signal: events.signal });
  systemTheme.addEventListener('change', () => {
    if (mode === 'card' && reason === 'direct' && !manualTheme) theme();
  }, { signal: events.signal });
  document.addEventListener('keydown', (event) => {
    if (mode === 'card' && reason === 'printer' && availability === 'ready' && event.key === 'Escape') {
      event.preventDefault();
      returnToScene();
    }
  }, { signal: events.signal });
  window.addEventListener('popstate', () => {
    if (new URL(window.location.href).searchParams.get('view') === 'card') {
      if (ownEntry() && runtime?.printed && availability === 'ready') activateScene({ replay: true });
      else presentCard('direct');
    } else activateScene();
  }, { signal: events.signal });
  service();
  return {
    get mode() { return mode; },
    get availability() { return availability; },
    start() {
      if (new URL(window.location.href).searchParams.get('view') === 'card') presentCard('direct');
      else return activateScene();
    },
    dispose() { destroyed = true; revision++; admission = undefined; events.abort(); loading.dispose(); runtime?.dispose(); },
  };
}
