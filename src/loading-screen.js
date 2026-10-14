const STAGES = ['modules', 'graphics', 'environment', 'card', 'shaders'];
const STAGE_LABELS = ['Загрузка модулей интерфейса…', 'Подготовка графической системы…',
  'Загрузка окружения и объектов…', 'Подготовка содержимого визитки…', 'Подготовка изображения…'];
const NAVIGATION_KEYS = new Set(['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);
const LINE_DELAY = 140;

export function createLoadingScreen({ window, document, onEnter, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const screen = document.querySelector('#scene-loading');
  const lines = [...screen.querySelectorAll('[data-boot-line]')];
  const rows = lines.filter((line) => line.dataset.stage);
  const progress = document.querySelector('#loading-progress');
  const status = document.querySelector('#loading-status');
  const button = document.querySelector('#loading-continue');
  const prompt = document.querySelector('#loading-prompt');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const events = new AbortController();
  const options = { signal: events.signal };
  let current = 0;
  let prepared = false;
  let shown = 0;
  let ready = false;
  let visible = false;
  let timer;

  function paint() {
    ready = prepared && shown === lines.length;
    screen.dataset.state = ready ? 'ready' : 'loading';
    const completed = prepared ? STAGES.length : current;
    progress.value = completed;
    for (const row of rows) {
      const index = STAGES.indexOf(row.dataset.stage);
      const state = index < completed ? 'done' : index === current ? 'active' : 'pending';
      row.dataset.state = state;
      row.querySelector('.boot-result').textContent = state === 'done' ? '[ OK ]' : state === 'active' ? '[ … ]' : '[ — ]';
    }
    button.disabled = button.hidden = !ready;
    status.textContent = ready ? 'Система готова. Ожидание ввода.'
      : prepared ? 'Вывод правового уведомления…' : STAGE_LABELS[current];
    prompt.textContent = ready ? 'Нажмите любую клавишу или кнопку мыши, чтобы войти' : 'Ожидание готовности системы';
  }
  function cancel() {
    if (timer !== undefined) clearTimer(timer);
    timer = undefined;
  }
  function print() {
    if (!visible || document.hidden || timer !== undefined) return;
    while (shown < lines.length) {
      const line = lines[shown];
      const index = STAGES.indexOf(line.dataset.stage);
      const available = index < 0 ? prepared : prepared || index <= current;
      if (!available) break;
      line.hidden = false;
      shown++;
      paint();
      if (!reducedMotion.matches && shown < lines.length) {
        timer = setTimer(() => { timer = undefined; print(); }, LINE_DELAY);
        return;
      }
    }
  }
  function enter(event) {
    if (!ready || !visible || screen.hidden || document.hidden || event.defaultPrevented) return;
    if (event.target.closest('a')) return;
    if (event.type === 'keydown' && (event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || NAVIGATION_KEYS.has(event.key))) return;
    if (event.type === 'click' && (event.button !== 0 || document.getSelection()?.isCollapsed === false)) return;
    event.preventDefault();
    event.stopPropagation();
    ready = false;
    onEnter();
  }
  screen.addEventListener('keydown', enter, options);
  screen.addEventListener('click', enter, options);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancel(); else print();
  }, options);
  reducedMotion.addEventListener('change', () => { cancel(); print(); }, options);
  paint();
  return {
    reset() {
      cancel(); current = shown = 0; prepared = false;
      for (const line of lines) line.hidden = true;
      paint(); print();
    },
    stage(value) {
      const index = STAGES.indexOf(value);
      if (index < 0 || prepared) return;
      current = Math.max(current, index);
      paint(); print();
    },
    setReady(value) { prepared = value; paint(); print(); },
    setVisible(value) { visible = value; if (value) { paint(); print(); } else cancel(); },
    dispose() { visible = false; cancel(); events.abort(); },
  };
}
