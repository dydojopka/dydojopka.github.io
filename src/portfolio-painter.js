import { t } from './i18n.js';
import { layoutMarkdown, runFont, TERMINAL_FONT } from './markdown-layout.js';
import { SCREEN_WIDTH, SCREEN_HEIGHT, MENU_ROW, MENU_TOP, MENU_BOTTOM, menuRegions } from './portfolio-layout.js';

const COLORS = {
  background: '#030b07', panel: '#06110b', border: '#245438',
  text: '#73df92', bright: '#a3ffb7', muted: '#499963',
};
const actionKey = (action) => action ? `${action.type}:${action.id ?? action.href ?? ''}` : '';

export function createPortfolioPainter(canvas, { profile, projects, images, portrait }) {
  const ctx = canvas.getContext('2d');
  let regions;
  let selectableItems;
  let highlighted;

  function text(value, x, y, size = 25, color = COLORS.text) {
    ctx.font = `${size}px ${TERMINAL_FONT}`;
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
  }
  function selectableText(value, x, y, size = 25, color = COLORS.text, href) {
    text(value, x, y, size, color);
    selectableItems.push({ text: value, x, y, size, href });
  }
  function panel(x, y, width, height) {
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);
  }
  function button(region, label, size = 24, active = false) {
    regions.push(region);
    if (active || highlighted === actionKey(region)) {
      ctx.fillStyle = '#123a22';
      ctx.fillRect(region.x, region.y, region.width, region.height);
      ctx.strokeStyle = COLORS.text;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(region.x, region.y, region.width, region.height);
      ctx.setLineDash([]);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(region.x + 12, region.y, region.width - 24, region.height);
    ctx.clip();
    text(label, region.x + 20, region.y + region.height / 2 + size * 0.32, size, active ? COLORS.bright : COLORS.text);
    ctx.restore();
  }
  function markdown(blocks, rect, size, scroll = 0, interactive = false) {
    const layout = layoutMarkdown(ctx, blocks, rect.width - 16, size, images);
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();
    for (const item of layout.items) {
      const x = rect.x + item.x;
      const y = rect.y + item.y - scroll;
      if (item.type === 'rule') {
        ctx.strokeStyle = COLORS.border;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + item.width, y);
        ctx.stroke();
        continue;
      }
      if (item.type === 'image') {
        if (y + item.height < rect.y || y > rect.y + rect.height) continue;
        const image = images.get(item.src);
        if (image?.complete && image.naturalWidth) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(image, x, y, item.width, item.height);
          ctx.imageSmoothingEnabled = true;
        } else {
          ctx.strokeStyle = COLORS.border;
          ctx.strokeRect(x, y, item.width, item.height);
          text(item.text || t('scene.image'), x + 12, y + size + 12, size, COLORS.muted);
        }
        if (interactive && item.href) {
          regions.push({
            x, y: Math.max(rect.y, y), width: item.width,
            height: Math.min(rect.y + rect.height, y + item.height) - Math.max(rect.y, y),
            type: 'link', href: item.href,
          });
        }
        continue;
      }
      if (y < rect.y || y > rect.y + rect.height) continue;
      ctx.font = runFont(item, item.size);
      ctx.fillStyle = item.href || item.bold ? COLORS.bright : COLORS.text;
      ctx.fillText(item.text, x, y);
      selectableItems.push({ ...item, x, y });
      if (item.href) {
        ctx.fillRect(x, y + 4, item.width, highlighted === `link:${item.href}` ? 3 : 1);
        if (interactive) {
          regions.push({
            x, y: Math.max(rect.y, y - item.size), width: item.width,
            height: Math.min(item.lineHeight, rect.y + rect.height - y + item.size),
            type: 'link', href: item.href,
          });
        }
      }
    }
    ctx.restore();
    return layout.height;
  }
  function scrollbar(rect, total, offset) {
    if (total <= rect.height) return;
    const thumb = Math.max(35, rect.height * rect.height / total);
    ctx.fillStyle = COLORS.border;
    ctx.fillRect(rect.x + rect.width - 4, rect.y, 3, rect.height);
    ctx.fillStyle = COLORS.text;
    ctx.fillRect(rect.x + rect.width - 4, rect.y + Math.min(1, offset / (total - rect.height)) * (rect.height - thumb), 3, thumb);
  }
  function photo(x, y, width, height) {
    if (!portrait.complete || !portrait.naturalWidth) {
      panel(x, y, width, height);
      return;
    }
    ctx.save();
    ctx.filter = 'grayscale(1) contrast(1.05)';
    ctx.drawImage(portrait, x, y, width, height);
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = '#79d996';
    ctx.fillRect(x, y, width, height);
    ctx.restore();
  }
  function paint({ page, selected, focused, compact, menuOpen, menuScroll, contentScroll, highlighted: highlight }) {
    highlighted = highlight;
    let contentRect;
    let contentHeight;
    regions = [];
    selectableItems = [];
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    panel(22, 24, 1396, 1032);
    panel(24, 26, 1392, 66);
    text(`${profile.handle}@workstation: ~/portfolio`, 48, 69, compact ? 32 : 28, COLORS.bright);
    button({ x: 1300, y: 26, width: 90, height: 66, type: 'close' }, '×', 30);
    if (compact) {
      button({ x: 48, y: 124, width: 420, height: 138, type: 'select', id: 'about' }, `↖ ${t('scene.about').toLocaleUpperCase()}`, 48, selected === 'about');
      button({ x: 500, y: 124, width: 892, height: 138, type: 'menu' }, `${t('scene.projects')} / ${String(projects.length).padStart(2, '0')} ${menuOpen ? '▴' : '▾'}`, 48, menuOpen);
      photo(1192, 286, 180, 240);
      selectableText(page.category, 60, 319, 27, COLORS.muted);
      markdown([{ type: 'heading', depth: 1, runs: [{ text: page.title }] }], { x: 60, y: 348, width: 1100, height: 162 }, 58);
      contentRect = { x: 60, y: 548, width: 1310, height: 350 };
      contentHeight = markdown(page.blocks, contentRect, 52, contentScroll, true);
      scrollbar(contentRect, contentHeight, contentScroll);
      profile.contacts.forEach((contact, index) => button({ x: 48 + index * 450, y: 920, width: 426, height: 110, type: 'link', href: contact.href }, `${contact.label} ${contact.href.startsWith('mailto:') ? '⧉' : '↗'}`, 42));
      if (menuOpen) {
        panel(46, 276, 1348, 754);
        projects.slice(Math.round(menuScroll / MENU_ROW), Math.round(menuScroll / MENU_ROW) + 5).forEach((project, index) => {
          button({ x: 60, y: 290 + index * 144, width: 1310, height: 130, type: 'select', id: project.id }, project.title, 48, selected === project.id);
        });
        regions = regions.filter((region) => region.y < 276 || region.type === 'select');
      }
    } else {
      panel(400, 120, 646, 870);
      panel(1068, 120, 324, 870);
      button({ x: 48, y: 132, width: 320, height: 76, type: 'select', id: 'about' }, `↖ ${t('scene.about').toLocaleUpperCase()}`, 27, selected === 'about');
      text(`${t('scene.projects')} / ${String(projects.length).padStart(2, '0')}`, 62, 252, 22, COLORS.muted);
      for (const region of menuRegions(projects, menuScroll)) {
        const project = projects.find((project) => project.id === region.id);
        button(region, project.title, 24, selected === region.id);
      }
      scrollbar({ x: 48, y: MENU_TOP, width: 320, height: MENU_BOTTOM - MENU_TOP }, projects.length * MENU_ROW - 8, menuScroll);
      text(t('scene.personalProjects'), 62, 932, 20, COLORS.muted);
      text(t('scene.projectsGithub'), 62, 962, 20, COLORS.muted);
      selectableText(page.category, 430, 166, 19, COLORS.muted);
      const titleHeight = markdown([{ type: 'heading', depth: 1, runs: [{ text: page.title }] }], { x: 430, y: 198, width: 584, height: 170 }, 36);
      contentRect = { x: 430, y: 198 + titleHeight + 16, width: 584, height: 950 - 198 - titleHeight - 16 };
      contentHeight = markdown(page.blocks, contentRect, 24, contentScroll, true);
      scrollbar(contentRect, contentHeight, contentScroll);
      text(t('scene.profile'), 1090, 160, 20, COLORS.muted);
      photo(1090, 188, 280, 373);
      selectableText(`@${profile.handle}`, 1090, 598, 26, COLORS.bright);
      profile.contacts.forEach((contact, index) => {
        const y = 624 + index * 100;
        button({ x: 1082, y, width: 310, height: 88, type: 'link', href: contact.href }, '', 23);
        text(`${contact.label} ${contact.href.startsWith('mailto:') ? '⧉' : '↗'}`, 1090, y + 30, 23, COLORS.bright);
        selectableText(contact.value, 1090, y + 63, 20, COLORS.text, contact.href);
      });
      text(`~/portfolio/${selected}`, 48, 1030, 23);
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.07)';
    for (let y = 0; y < SCREEN_HEIGHT; y += 4) ctx.fillRect(24, y, 1392, 1);
    return { regions, selectableItems, contentRect, contentHeight };
  }

  return { paint, setContent(content) { ({ profile, projects } = content); } };
}
