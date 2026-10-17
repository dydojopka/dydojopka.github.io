import { subscribeLocale, t } from './i18n.js';

const CODE = '676767';
const BLUE_START = 6;
const BLUE_CLEAR = 6.6;
const DURATION = 11.6;

export function createDeathSequence({
  document, baseUrl, reducedMotion,
  onStart = () => {}, onVisual = () => {}, onTime = () => {},
  reload = () => document.defaultView.location.reload(),
  requestFrame = (callback) => requestAnimationFrame(callback), cancelFrame = (id) => cancelAnimationFrame(id),
}) {
  const overlay = document.createElement('dialog');
  overlay.className = 'death-overlay';
  overlay.setAttribute('aria-label', t('scene.deathLabel'));
  overlay.tabIndex = -1;
  overlay.innerHTML = `
    <div class="death-warning" aria-hidden="true"><i></i><strong>SYSTEM FAILURE</strong><span>${t('scene.deathWarning')}</span></div>
    <div class="death-blue" hidden>
      <img class="death-blue-art" alt="" draggable="false">
      <div class="death-error-copy">
        <h2>${t('scene.deathHeading')}</h2>
        <p class="death-exception">${t('scene.deathException').replaceAll('\n', '<br>')}</p>
        <p class="death-support">${t('scene.deathSupport').replaceAll('\n', '<br>')}</p>
        <p class="death-stop">***STOP: 0x001E97FF [LSTR-512]</p>
        <p class="death-restart">${t('scene.deathRestart')}</p>
      </div>
      <div class="death-shutters" aria-hidden="true"></div>
    </div>`;
  overlay.querySelector('img').src = `${baseUrl}images/death-blue-screen.png`;
  const warning = overlay.querySelector('.death-warning');
  const blue = overlay.querySelector('.death-blue');
  const shutters = overlay.querySelector('.death-shutters');
  const slices = Array.from({ length: 28 }, () => {
    const slice = document.createElement('i'); shutters.append(slice); return slice;
  });
  overlay.addEventListener('cancel', (event) => event.preventDefault());
  document.body.append(overlay);
  let buffer = '', running = false, active = false, disposed = false, finished = false;
  let elapsed = 0, lastTime, frame = 0;

  function paint() {
    const quiet = reducedMotion.matches;
    const phase = quiet || elapsed >= BLUE_START ? 'blue' : 'glitch';
    const reveal = quiet ? 1 : Math.min(1, Math.max(0, (elapsed - BLUE_START) / (BLUE_CLEAR - BLUE_START)));
    overlay.dataset.phase = phase;
    overlay.dataset.quiet = String(quiet);
    blue.hidden = phase !== 'blue';
    warning.hidden = quiet || elapsed < 0.35 || elapsed > 2.4;
    shutters.hidden = reveal === 1;
    if (!shutters.hidden && phase === 'blue') slices.forEach((slice, index) => {
      const delay = ((index * 17) % 28) / 42;
      const remaining = 1 - Math.min(1, Math.max(0, (reveal - delay) / (1 - delay)));
      slice.style.transform = `scaleX(${Math.ceil(remaining * 8) / 8})`;
      slice.style.transformOrigin = index % 2 ? 'left' : 'right';
    });
    const fade = quiet ? 1 : 1 - Math.max(0, (elapsed - DURATION + 0.65) / 0.65);
    blue.style.opacity = String(fade);
    overlay.style.backgroundColor = phase === 'blue' ? '#000' : 'transparent';
    onTime(elapsed);
    onVisual({ time: elapsed, strength: quiet || phase === 'blue' ? 0 : 1, phase });
  }
  function tick(time) {
    frame = 0;
    if (!active || !running || disposed || finished) return;
    if (lastTime !== undefined) elapsed += Math.max(0, time - lastTime) / 1000;
    lastTime = time;
    paint();
    if (elapsed >= DURATION) { finished = true; reload(); return; }
    frame = requestFrame(tick);
  }
  function resume() {
    if (!running || !active || disposed || finished) return;
    if (!overlay.open) overlay.showModal();
    paint();
    if (!frame) frame = requestFrame(tick);
  }
  const unsubscribeLocale = subscribeLocale(() => {
    overlay.setAttribute('aria-label', t('scene.deathLabel'));
    overlay.querySelector('.death-warning span').textContent = t('scene.deathWarning');
    overlay.querySelector('.death-error-copy h2').textContent = t('scene.deathHeading');
    overlay.querySelector('.death-exception').innerHTML = t('scene.deathException').replaceAll('\n', '<br>');
    overlay.querySelector('.death-support').innerHTML = t('scene.deathSupport').replaceAll('\n', '<br>');
    overlay.querySelector('.death-restart').textContent = t('scene.deathRestart');
  });
  return {
    get running() { return running; },
    resetInput() { buffer = ''; },
    input(event) {
      if (disposed || running || !active) return false;
      if (event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey
        || event.target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) {
        buffer = ''; return false;
      }
      // Any intervening key breaks the three consecutive pairs. The newest 6
      // can begin a fresh attempt, without collecting digits from other input.
      buffer += event.key.length === 1 ? event.key : '\0';
      while (buffer && !CODE.startsWith(buffer)) buffer = buffer.slice(1);
      if (buffer !== CODE) return false;
      buffer = ''; running = true;
      onStart(); resume();
      return true;
    },
    setActive(value) {
      if (disposed || active === value) return;
      active = value; buffer = ''; lastTime = undefined;
      cancelFrame(frame); frame = 0;
      if (!value) { if (overlay.open) overlay.close(); }
      else resume();
    },
    refresh() { if (running && active && !disposed) paint(); },
    dispose() {
      if (disposed) return;
      disposed = true; unsubscribeLocale(); active = false; buffer = '';
      cancelFrame(frame);
      overlay.remove();
    },
  };
}
