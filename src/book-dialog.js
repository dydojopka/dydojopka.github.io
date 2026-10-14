export const BOOK_MESSAGES = [
  'На столе лежит книга. Кажется, она очень древняя.',
  'Она словно зовёт меня.',
];
const LETTER_DELAY = 45;

export function createBookDialog({
  document, reducedMotion, onChange = () => {},
  now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout,
}) {
  const events = new AbortController();
  const dialog = document.createElement('dialog');
  dialog.className = 'book-dialog';
  dialog.setAttribute('aria-label', 'Книга');
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
    else if (page + 1 < BOOK_MESSAGES.length) { page++; beginPage(); schedule(); }
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
      ready = length === [...BOOK_MESSAGES[page]].length;
      arrow.hidden = !ready;
      dialog.dataset.state = ready ? 'reading' : 'typing';
      remaining = LETTER_DELAY;
      schedule();
    }, remaining);
  }
  function beginPage() {
    length = reducedMotion.matches ? [...BOOK_MESSAGES[page]].length : 0;
    ready = reducedMotion.matches;
    paintText();
    accessible.textContent = BOOK_MESSAGES[page];
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
    const letters = [...BOOK_MESSAGES[page]];
    text.textContent = letters.slice(0, length).join('');
    // Reserve the unrevealed words so line breaks never jump during typing.
    remainder.textContent = letters.slice(length).join('');
  }
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
      disposed = true; events.abort(); cancelTimer(); dialog.remove();
    },
  };

  function finishTyping() {
    if (!opened) return;
    cancelTimer();
    length = [...BOOK_MESSAGES[page]].length; ready = true;
    paintText(); arrow.hidden = false;
    dialog.dataset.state = 'reading'; remaining = LETTER_DELAY;
  }
}
