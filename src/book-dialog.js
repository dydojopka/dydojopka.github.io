import { getLocale, subscribeLocale, t } from './i18n.js';

export function getBookMessages(locale = getLocale()) {
  return [t('scene.bookMessage1', {}, locale), t('scene.bookMessage2', {}, locale)];
}
export const BOOK_MESSAGES = getBookMessages('ru');
const LETTER_DELAY = 45;

export function createBookDialog({
  document, reducedMotion, onChange = () => {},
  now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout,
}) {
  const events = new AbortController();
  const dialog = document.createElement('dialog');
  dialog.className = 'book-dialog';
  dialog.setAttribute('aria-label', t('scene.book'));
  dialog.setAttribute('aria-describedby', 'book-dialog-message');
  dialog.setAttribute('tabindex', '-1');
  const line = document.createElement('p');
  line.className = 'book-dialog-line'; line.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.className = 'book-dialog-text';
  const remainder = document.createElement('span');
  remainder.className = 'book-dialog-remainder';
  line.append(text, remainder);
  const accessible = document.createElement('p');
  accessible.className = 'screen-access'; accessible.id = 'book-dialog-message';
  accessible.setAttribute('aria-live', 'polite'); accessible.setAttribute('aria-atomic', 'true');
  const arrow = document.createElement('span');
  arrow.className = 'book-dialog-arrow'; arrow.setAttribute('aria-hidden', 'true');
  dialog.append(line, accessible, arrow);
  document.body.append(dialog);
  dialog.addEventListener('cancel', (event) => event.preventDefault(), { signal: events.signal });
  dialog.addEventListener('keydown', (event) => event.stopPropagation(), { signal: events.signal });
  let messages = getBookMessages();
  let opened = false, active = true, disposed = false;
  let page = 0, length = 0, ready = false, timer, deadline = 0, remaining = LETTER_DELAY, revision = 0;
  let previousFocus, pointerDown;

  // Only gestures begun inside the open modal can advance it. In particular,
  // the book's opening pointerup must not also skip the first message.
  dialog.addEventListener('pointerdown', (event) => {
    if (opened && event.button === 0) pointerDown = { x: event.clientX, y: event.clientY };
  }, { signal: events.signal });
  dialog.addEventListener('pointermove', (event) => {
    if (pointerDown && Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 8) pointerDown = undefined;
  }, { signal: events.signal });
  dialog.addEventListener('pointercancel', () => { pointerDown = undefined; }, { signal: events.signal });
  dialog.addEventListener('click', (event) => {
    const pressed = pointerDown; pointerDown = undefined;
    if (!pressed || !opened || !active || event.button !== 0) return;
    if (!ready) finishTyping();
    else if (page + 1 < messages.length) { page++; beginPage(); schedule(); }
    else close();
  }, { signal: events.signal });

  function cancelTimer() {
    revision++;
    if (timer !== undefined) clearTimer(timer);
    timer = undefined;
  }
  function schedule() {
    if (!opened || ready || !active || disposed || timer !== undefined) return;
    deadline = now() + remaining;
    const currentRevision = revision;
    timer = setTimer(() => {
      if (currentRevision !== revision) return;
      timer = undefined;
      if (!opened || ready || !active || disposed) return;
      length++;
      paintText();
      ready = length === [...messages[page]].length;
      arrow.hidden = !ready;
      dialog.dataset.state = ready ? 'reading' : 'typing';
      remaining = LETTER_DELAY;
      schedule();
    }, remaining);
  }
  function beginPage() {
    length = reducedMotion.matches ? [...messages[page]].length : 0;
    ready = reducedMotion.matches;
    paintText();
    accessible.textContent = messages[page];
    arrow.hidden = !ready;
    dialog.dataset.page = String(page + 1);
    dialog.dataset.state = ready ? 'reading' : 'typing';
    remaining = LETTER_DELAY;
  }
  function close({ restoreFocus = true } = {}) {
    if (!opened) return;
    opened = false; pointerDown = undefined; cancelTimer();
    dialog.close();
    onChange(false);
    if (restoreFocus && previousFocus?.isConnected && !previousFocus.closest('[hidden], [inert]')) previousFocus.focus({ preventScroll: true });
    previousFocus = undefined;
  }
  function paintText() {
    const letters = [...messages[page]];
    text.textContent = letters.slice(0, length).join('');
    // Reserve the unrevealed words so line breaks never jump during typing.
    remainder.textContent = letters.slice(length).join('');
  }
  const unsubscribeLocale = subscribeLocale(() => {
    const progress = length / [...messages[page]].length;
    messages = getBookMessages();
    dialog.setAttribute('aria-label', t('scene.book'));
    dialog.lang = getLocale();
    length = ready ? [...messages[page]].length : Math.floor(progress * [...messages[page]].length);
    if (opened) {
      paintText();
      accessible.textContent = messages[page];
    }
  });
  return {
    get open() { return opened; },
    show() {
      if (disposed || opened || !active || !dialog.showModal) return false;
      previousFocus = document.activeElement;
      page = 0; beginPage();
      dialog.showModal(); opened = true;
      onChange(true); dialog.focus({ preventScroll: true }); schedule();
      return true;
    },
    close,
    setActive(value) {
      if (active === value || disposed) return;
      active = value;
      if (!value) {
        pointerDown = undefined;
        if (timer !== undefined) remaining = Math.max(0, deadline - now());
        cancelTimer();
      } else schedule();
    },
    finishTyping,
    dispose() {
      if (disposed) return;
      close({ restoreFocus: false });
      disposed = true; unsubscribeLocale(); events.abort(); cancelTimer(); dialog.remove();
    },
  };

  function finishTyping() {
    if (!opened) return;
    cancelTimer();
    length = [...messages[page]].length; ready = true;
    paintText(); arrow.hidden = false;
    dialog.dataset.state = 'reading'; remaining = LETTER_DELAY;
  }
}
