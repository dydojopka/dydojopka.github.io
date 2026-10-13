const SIZE = 128;
const LIFE = 180;
const LENGTH = 52;
const ARMS = [[-2, -10], [-10, -2], [6, -2], [-2, 6]];

export function createCursor(host, reducedMotion) {
  const canvas = document.createElement('canvas');
  canvas.className = 'pixel-cursor';
  canvas.width = canvas.height = SIZE;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.hidden = true;
  const context = canvas.getContext('2d');
  if (!context) return { setEnabled() {}, dispose() {} };
  document.body.append(canvas);
  const events = new AbortController();
  const options = { signal: events.signal };
  const finePointer = matchMedia('(any-hover: hover) and (any-pointer: fine)');
  let enabled = true;
  let position;
  let history = [];
  let frame = 0;

  function hide() {
    cancelAnimationFrame(frame);
    frame = 0;
    canvas.hidden = true;
    host.classList.remove('cursor-active');
    position = undefined;
    history = [];
  }
  function stamp(x, y, color, alpha) {
    context.fillStyle = color;
    context.globalAlpha = alpha;
    for (const [dx, dy] of ARMS) context.fillRect(Math.round(x + dx), Math.round(y + dy), 4, 4);
  }
  function draw(time) {
    frame = 0;
    if (!position) return;
    context.clearRect(0, 0, SIZE, SIZE);
    history = history.filter((point) => time - point.time < LIFE && Math.hypot(point.x - position.x, point.y - position.y) <= LENGTH);
    if (!reducedMotion.matches) {
      for (const point of history) {
        const fade = 1 - (time - point.time) / LIFE;
        const distance = Math.hypot(point.x - position.x, point.y - position.y);
        const taper = 1 - distance / LENGTH;
        stamp(SIZE / 2 + point.x - position.x, SIZE / 2 + point.y - position.y, '#d8672d', fade * taper * 0.34);
      }
    }
    // Offset shading remains translucent, including where the four arms meet
    // their shadows. It must not turn into the PNG reference's dark outline.
    stamp(SIZE / 2 + 2, SIZE / 2 + 2, '#465067', 0.18);
    stamp(SIZE / 2, SIZE / 2, '#898c78', 0.78);
    context.globalAlpha = 1;
    if (!reducedMotion.matches && history.length) frame = requestAnimationFrame(draw);
  }
  host.addEventListener('pointermove', (event) => {
    if (!enabled || event.pointerType !== 'mouse' || !finePointer.matches || event.target.closest('.scene-sound')) {
      hide();
      return;
    }
    const now = performance.now();
    const next = { x: event.clientX, y: event.clientY, time: now };
    if (position && !reducedMotion.matches) {
      const dx = next.x - position.x, dy = next.y - position.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 0) {
        const length = Math.min(distance, LENGTH);
        for (let offset = length; offset > 0; offset -= 4) {
          const fraction = offset / distance;
          history.push({ x: next.x - dx * fraction, y: next.y - dy * fraction, time: now - Math.min(LIFE, now - position.time) * fraction });
        }
        history = history.slice(-48);
      }
    }
    position = next;
    canvas.style.transform = `translate3d(${Math.round(next.x) - SIZE / 2}px, ${Math.round(next.y) - SIZE / 2}px, 0)`;
    canvas.hidden = false;
    host.classList.add('cursor-active');
    cancelAnimationFrame(frame);
    draw(now);
  }, options);
  host.addEventListener('pointerleave', hide, options);
  window.addEventListener('blur', hide, options);
  document.addEventListener('visibilitychange', hide, options);
  finePointer.addEventListener('change', hide, options);
  reducedMotion.addEventListener('change', () => {
    history = [];
    cancelAnimationFrame(frame);
    draw(performance.now());
  }, options);
  return {
    setEnabled(value) { enabled = value; if (!value) hide(); },
    dispose() { hide(); events.abort(); canvas.remove(); },
  };
}
