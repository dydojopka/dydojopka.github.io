import { CanvasTexture, SRGBColorSpace } from 'three';
import { businessCardPhotoUrl } from './business-card-html.js';
import { layoutMarkdown, runFont } from './markdown-layout.js';

const WIDTH = 850;
const HEIGHT = 1200;
const MARGIN = 68;
const FONT = 'system-ui, sans-serif';

export async function loadBusinessCardImages(about, base = '/', createImage = () => new Image()) {
  const photo = businessCardPhotoUrl(about, base);
  const sources = new Set([photo, ...about.blocks.flatMap((block) => block.runs.filter((run) => run.type === 'image').map((run) => run.src))].filter(Boolean));
  const images = new Map();
  await Promise.all([...sources].map((src) => new Promise((resolve) => {
    const image = createImage();
    if (/^https?:\/\//i.test(src)) image.crossOrigin = 'anonymous';
    image.onload = () => { images.set(src, image); resolve(); };
    image.onerror = () => resolve();
    image.src = src;
  })));
  return { portrait: images.get(photo), images };
}

export function businessCardPaperBlocks(about) {
  return [...about.blocks,
    { type: 'heading', depth: 2, runs: [{ text: 'Контакты' }] },
    ...about.contacts.map((contact) => ({ type: 'list', runs: [
      { text: '• ' }, { text: contact.label, href: contact.href }, { text: `: ${contact.value}` },
    ] })),
  ];
}

export function layoutBusinessCardPaper(context, about, { portrait, images = new Map() } = {}) {
  const width = WIDTH - MARGIN * 2;
  const blocks = businessCardPaperBlocks(about);
  let result;
  // Fit the complete pre-project card, preserving text and image proportions.
  // The trailing part of the A4 sheet remains visible in the short output tray.
  for (let size = 30; size >= 12; size--) {
    const title = layoutMarkdown(context, [{ type: 'heading', depth: 1, runs: [{ text: about.title }] }], width, size * 2, images, FONT);
    const photoWidth = 112 * size / 17;
    const photoHeight = photoWidth * (portrait?.naturalHeight || 1078) / (portrait?.naturalWidth || 809);
    const photoY = MARGIN + title.height;
    const bodyY = photoY + photoHeight + size * 1.4;
    const body = layoutMarkdown(context, blocks, width, size, images, FONT);
    result = { title, body, size, photo: { x: MARGIN, y: photoY, width: photoWidth, height: photoHeight }, bodyY };
    if (bodyY + body.height <= HEIGHT - MARGIN) break;
  }
  return result;
}

export function createBusinessCardTexture(about, createCanvas = () => document.createElement('canvas'), assets = {}) {
  const canvas = createCanvas();
  canvas.width = WIDTH; canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Business card canvas is unavailable');
  const layout = layoutBusinessCardPaper(context, about, assets);
  context.fillStyle = '#fffef9'; context.fillRect(0, 0, WIDTH, HEIGHT);
  context.textAlign = 'left'; context.textBaseline = 'alphabetic';
  function draw(items, top) {
    for (const item of items) {
      const x = MARGIN + item.x, y = top + item.y;
      if (item.type === 'image') {
        const image = assets.images?.get(item.src);
        if (image) context.drawImage(image, x, y, item.width, item.height);
      } else if (item.type === 'rule') {
        context.fillStyle = '#d8d7ce'; context.fillRect(x, y, item.width, 1);
      } else {
        context.font = runFont(item, item.size, FONT);
        context.fillStyle = item.href ? '#245044' : '#252922';
        context.fillText(item.text, x, y);
        if (item.href) context.fillRect(x, y + 2, item.width, 1);
      }
    }
  }
  draw(layout.title.items, MARGIN);
  const photo = layout.photo;
  if (assets.portrait) context.drawImage(assets.portrait, photo.x, photo.y, photo.width, photo.height);
  else { context.fillStyle = '#e4e5df'; context.fillRect(photo.x, photo.y, photo.width, photo.height); }
  draw(layout.body.items, layout.bodyY);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
