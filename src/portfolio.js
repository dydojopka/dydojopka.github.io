import * as THREE from 'three';
import { about, profile, projects } from './portfolio-content.js';
import { blocksHtml, runsHtml } from './markdown.js';
import { createPortfolioPainter } from './portfolio-painter.js';
import { SCREEN_WIDTH, SCREEN_HEIGHT, MENU_ROW, MENU_TOP, MENU_BOTTOM, screenAction } from './portfolio-layout.js';
import { copyEmail } from './clipboard.js';
import { createMonitorTextLayer } from './monitor-text-layer.js';
import './portfolio.css';

const htmlText = (text) => runsHtml([{ text }]);
const actionKey = (action) => action ? `${action.type}:${action.id ?? action.href ?? ''}` : '';

export function createPortfolio({ host }) {
  const canvas = document.createElement('canvas');
  canvas.width = SCREEN_WIDTH;
  canvas.height = SCREEN_HEIGHT;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  let selected = 'about';
  let focused = false;
  let fallback = false;
  let compact = false;
  let menuOpen = false;
  let menuScroll = 0;
  let contentScroll = 0;
  let contentHeight = 0;
  let contentRect;
  let regions = [];
  let highlighted = '';
  let notify = () => {};
  let enter = () => {};
  let leave = () => {};
  let screen;
  let camera;
  let pointerDown;
  let imageRevision = 0;
  const images = new Map();
  const imageRuns = [about, ...projects].flatMap((page) => page.blocks.flatMap((block) => block.runs));
  function imageChanged() {
    imageRevision++;
    paint();
  }
  for (const run of imageRuns) {
    if (run.type !== 'image' || !run.src || images.has(run.src)) continue;
    const image = new Image();
    if (/^https?:\/\//i.test(run.src)) image.crossOrigin = 'anonymous';
    image.addEventListener('load', imageChanged);
    image.addEventListener('error', imageChanged);
    images.set(run.src, image);
    image.src = run.src;
  }
  const textLayer = createMonitorTextLayer(host, (href) => perform({ type: 'link', href }));
  const notice = document.createElement('div');
  notice.className = 'terminal-notice';
  notice.setAttribute('role', 'status');
  notice.hidden = true;
  document.body.append(notice);
  let noticeTimer;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const portrait = new Image();
  portrait.src = `${import.meta.env.BASE_URL}${profile.photo.replace(/^\//, '')}`;
  portrait.addEventListener('load', paint);
  portrait.addEventListener('error', paint);
  const painter = createPortfolioPainter(canvas, { profile, projects, images, portrait });
  const reader = document.createElement('section');
  reader.id = 'portfolio-reader';
  reader.className = 'portfolio-reader screen-access';
  reader.setAttribute('aria-label', 'Визитка на мониторе');
  reader.inert = true;
  reader.innerHTML = `<div class="terminal-window">
    <header class="terminal-titlebar"><span>${htmlText(profile.handle)}@workstation: ~/portfolio</span></header>
    <div class="terminal-body">
      <nav class="terminal-nav" aria-label="Визитка и проекты">
        <button type="button" class="terminal-home" data-project="about">↖ Обо мне</button>
        <p class="terminal-label">ПРОЕКТЫ / ${String(projects.length).padStart(2, '0')}</p>
        <div class="terminal-projects">${projects.map((project, index) => `<button type="button" data-project="${htmlText(project.id)}"><span class="project-number">${String(index + 1).padStart(2, '0')}</span>${htmlText(project.title)}</button>`).join('')}</div>
      </nav>
      <article class="terminal-article" tabindex="0" aria-label="Содержание выбранного раздела"></article>
      <aside class="terminal-profile" aria-label="Фото и контакты"><p class="terminal-label">ПРОФИЛЬ / 001</p>
        <div class="terminal-portrait"><img src="${htmlText(portrait.src)}" alt="${htmlText(profile.name)}" width="809" height="1078" /></div>
        <p class="terminal-handle">@${htmlText(profile.handle)}</p>
        <div class="terminal-contacts">${profile.contacts.map((contact) => `<a href="${htmlText(contact.href)}" ${/^https?:/.test(contact.href) ? 'target="_blank" rel="noopener noreferrer"' : ''}><span>${htmlText(contact.label)} ${contact.href.startsWith('mailto:') ? '⧉' : '↗'}</span><span>${htmlText(contact.value)}</span></a>`).join('')}</div>
      </aside>
    </div>
    <footer class="terminal-status"><span class="terminal-current"></span><span>РЕЖИМ БЕЗ 3D</span></footer>
  </div>`;
  document.body.append(reader);
  const article = reader.querySelector('.terminal-article');
  const leaveButton = host.querySelector('#leave-monitor');
  leaveButton.addEventListener('click', () => leave());

  function currentPage() {
    return projects.find((project) => project.id === selected) ?? about;
  }
  function renderContent() {
    const page = currentPage();
    article.innerHTML = `<p class="terminal-label">${htmlText(page.category)}</p><h1>${htmlText(page.title)}</h1>${blocksHtml(page.blocks)}`;
    article.scrollTop = 0;
    reader.dataset.selected = selected;
    for (const button of reader.querySelectorAll('[data-project]')) {
      const active = button.dataset.project === selected;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    reader.querySelector('.terminal-current').textContent = `~/portfolio/${selected}`;
  }
  function select(id) {
    if (id !== 'about' && !projects.some((project) => project.id === id)) return;
    selected = id;
    contentScroll = 0;
    menuOpen = false;
    highlighted = '';
    renderContent();
    paint();
  }
  reader.addEventListener('click', (event) => {
    const email = event.target.closest('a[href^="mailto:"]');
    if (email && (focused || fallback)) {
      event.preventDefault();
      copyContact(email.getAttribute('href'));
    }
    const button = event.target.closest('[data-project]');
    if (button && (focused || fallback)) select(button.dataset.project);
  });
  reader.addEventListener('focusin', (event) => {
    const element = event.target;
    const id = element.dataset.project;
    if (id && id !== 'about') {
      const index = projects.findIndex((project) => project.id === id);
      menuScroll = Math.max(0, Math.min(index * MENU_ROW, Math.max(0, (projects.length - 8) * MENU_ROW)));
      if (compact && focused) menuOpen = true;
    }
    highlighted = id ? `select:${id}` : element.href ? `link:${element.getAttribute('href')}` : '';
    paint();
  });
  function scrollContent(amount) {
    const previous = contentScroll;
    contentScroll = Math.max(0, Math.min(contentScroll + amount, Math.max(0, contentHeight - contentRect.height)));
    if (previous !== contentScroll) paint();
  }
  document.addEventListener('keydown', (event) => {
    if (!focused || fallback || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      leave();
    } else if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp'].includes(event.key)) {
      event.preventDefault();
      const direction = event.key.endsWith('Down') ? 1 : -1;
      const step = event.key.startsWith('Page') ? contentRect.height * 0.8 : 80;
      scrollContent(direction * step);
    }
  });

  function paint() {
    const painting = painter.paint({
      page: currentPage(), selected, focused, compact, menuOpen,
      menuScroll, contentScroll, highlighted,
    });
    ({ regions, contentRect, contentHeight } = painting);
    textLayer.setContent(compact && menuOpen ? [] : painting.selectableItems,
      `${selected}:${compact}:${menuOpen}:${contentScroll}:${imageRevision}`);
    textLayer.update(screen, camera, focused && !fallback);
    texture.needsUpdate = true;
    notify();
  }

  function hit(event) {
    if (!screen || !camera || fallback) return undefined;
    const rect = host.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(pointer, camera);
    return focused ? raycaster.intersectObject(screen, false)[0] : raycaster.intersectObject(screen.parent, true)[0];
  }
  async function copyContact(href) {
    const copied = await copyEmail(href);
    notice.textContent = copied ? 'Email скопирован' : 'Не удалось скопировать email';
    notice.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice.hidden = true; }, 2200);
  }
  function perform(action) {
    if (!focused || !action) return;
    if (action.type === 'select') select(action.id);
    else if (action.type === 'close') leave();
    else if (action.type === 'menu') {
      menuOpen = !menuOpen;
      menuScroll = 0;
      paint();
    } else if (action.type === 'link') {
      if (action.href.startsWith('mailto:')) copyContact(action.href);
      else window.open(action.href, '_blank', 'noopener,noreferrer');
    }
  }
  function scrollAt(uv, amount) {
    const x = uv.x * SCREEN_WIDTH;
    const y = (1 - uv.y) * SCREEN_HEIGHT;
    if (menuOpen || (!compact && x < 380 && y >= MENU_TOP && y <= MENU_BOTTOM)) {
      const previous = menuScroll;
      menuScroll = Math.max(0, Math.min(menuScroll + Math.sign(amount) * MENU_ROW, Math.max(0, projects.length - (compact ? 5 : 8)) * MENU_ROW));
      if (previous !== menuScroll) paint();
    } else scrollContent(amount);
  }
  host.addEventListener('pointerdown', (event) => {
    const touchText = event.pointerType !== 'mouse' && event.target.closest('.monitor-text-layer');
    if (event.button !== 0 || (event.target.tagName !== 'CANVAS' && !touchText)) return;
    pointerDown = { x: event.clientX, y: event.clientY, lastY: event.clientY, pointerType: event.pointerType };
    if (focused && !touchText) host.setPointerCapture(event.pointerId);
  });
  host.addEventListener('pointermove', (event) => {
    if (!focused || textLayer.selecting) return;
    if (event.pointerType !== 'mouse' && !window.getSelection()?.isCollapsed) return;
    const intersection = hit(event);
    if (pointerDown && pointerDown.pointerType !== 'mouse' && intersection) {
      scrollAt(intersection.uv, (pointerDown.lastY - event.clientY) * SCREEN_HEIGHT / host.clientHeight * 2);
      pointerDown.lastY = event.clientY;
    } else {
      const key = actionKey(screenAction(intersection?.uv, regions, focused));
      if (highlighted !== key) {
        highlighted = key;
        paint();
      }
    }
  });
  host.addEventListener('pointercancel', () => { pointerDown = undefined; });
  host.addEventListener('pointerup', (event) => {
    const down = pointerDown;
    pointerDown = undefined;
    if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 8) return;
    const intersection = hit(event);
    if (!intersection) return;
    if (!focused) {
      enter();
      return;
    }
    perform(screenAction(intersection.uv, regions, focused));
  });
  host.addEventListener('wheel', (event) => {
    if (!focused) return;
    const intersection = hit(event);
    if (!intersection) return;
    event.preventDefault();
    scrollAt(intersection.uv, event.deltaY * (event.deltaMode === 1 ? 24 : 1));
  }, { passive: false });
  renderContent();
  paint();
  return {
    texture,
    attach(options) { ({ screen, camera, onChange: notify, onEnter: enter, onLeave: leave } = options); },
    updateTextProjection() { textLayer.update(screen, camera, focused && !fallback); },
    setViewport(width, height) {
      const next = Math.min(width, height * 4 / 3) < 700;
      if (compact === next) return;
      compact = next;
      contentScroll = menuScroll = 0;
      paint();
    },
    setFocused(value) {
      focused = value;
      reader.inert = !value && !fallback;
      highlighted = '';
      paint();
      if (!value) window.getSelection()?.removeAllRanges();
      if (value && !fallback) article.focus({ preventScroll: true });
    },
    setFallback(value) {
      fallback = value;
      reader.classList.toggle('screen-access', !value);
      reader.classList.toggle('terminal-fallback', value);
      reader.inert = !value && !focused;
      textLayer.update(screen, camera, focused && !fallback);
      if (value) reader.querySelector(`[data-project="${selected}"]`)?.focus({ preventScroll: true });
    },
  };
}
