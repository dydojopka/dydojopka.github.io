import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { loadMarkdownFiles } from '../src/markdown.js';
import { businessCardHtml, businessCardPhotoUrl } from '../src/business-card-html.js';
import { localizeHtml } from '../src/localize-html.js';
import { getLicenseDisclaimerHtml } from './license-disclaimer-html.js';

export const BUSINESS_CARD_PDF = 'business-card.pdf';
export const BUSINESS_CARD_PDF_DOWNLOAD = 'evgeny-ashroev-business-card.pdf';
export const BUSINESS_CARD_PDF_EN = 'business-card-en.pdf';
export const BUSINESS_CARD_PDF_EN_DOWNLOAD = 'evgeny-ashroev-business-card-en.pdf';
const pdfName = (locale) => locale === 'en' ? BUSINESS_CARD_PDF_EN : BUSINESS_CARD_PDF;
const pdfDownload = (locale) => locale === 'en' ? BUSINESS_CARD_PDF_EN_DOWNLOAD : BUSINESS_CARD_PDF_DOWNLOAD;

export function businessCardPlugin() {
  let config;
  let assets = {};
  const pdfs = new Map();
  async function files(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    return (await Promise.all(entries.map((entry) => entry.isDirectory()
      ? files(resolve(directory, entry.name)) : resolve(directory, entry.name)))).flat();
  }
  const key = (path) => `../${relative(config.root, path).replaceAll('\\', '/')}`;
  const contentDirectory = (locale) => resolve(config.root, 'content', locale);
  async function locales() {
    const paths = await files(resolve(config.root, 'content'));
    return ['ru', 'en'].filter((locale) => paths.includes(resolve(contentDirectory(locale), 'about.md')));
  }
  async function pages(locale = 'ru') {
    const markdown = {};
    const imageUrls = { ...assets };
    for (const path of await files(resolve(config.root, 'content'))) {
      if (/\.md$/i.test(path) && dirname(path) === contentDirectory(locale)) markdown[key(path)] = await readFile(path, 'utf8');
      else if (config.command === 'serve') imageUrls[key(path)] = `${config.base}${key(path).slice(3)}`;
    }
    return loadMarkdownFiles(markdown, imageUrls, config.base, locale);
  }
  async function generatePdf(locale) {
    const content = await pages(locale);
    const images = {};
    const publicRoot = resolve(config.root, 'public');
    const imageUrl = (path) => config.command === 'serve' ? `${config.base}${key(path).slice(3)}` : assets[key(path)];
    const paths = new Map((await files(resolve(config.root, 'content'))).map((path) => [imageUrl(path), path]));
    const portraitUrl = businessCardPhotoUrl(content.about, config.base);
    const urls = new Set([portraitUrl, ...[content.about, ...content.projects]
      .flatMap((page) => page.blocks.flatMap((block) => block.runs)).filter((run) => run.type === 'image').map((run) => run.src)]);
    for (const url of urls) {
      if (!url) continue;
      let path = paths.get(url);
      if (!path && url.startsWith(config.base) && !/^https?:/i.test(url)) {
        path = resolve(publicRoot, url.slice(config.base.length));
        const local = relative(publicRoot, path);
        if (local.startsWith('..') || local.includes(':')) continue;
      }
      if (!path || !/\.(png|jpe?g)$/i.test(path)) continue;
      try {
        const source = await readFile(path);
        images[url] = `data:image/${/\.png$/i.test(path) ? 'png' : 'jpeg'};base64,${source.toString('base64')}`;
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const { createBusinessCardPdf } = await import('./business-card-pdf.js');
    return createBusinessCardPdf(content, { images, portrait: images[portraitUrl], locale });
  }
  function getPdf(locale = 'ru') {
    if (!pdfs.has(locale)) pdfs.set(locale, generatePdf(locale).catch((error) => { pdfs.delete(locale); throw error; }));
    return pdfs.get(locale);
  }
  function requestLocale(url = '') {
    const path = url.split('?')[0];
    return path.startsWith(`${config.base}en/`) || path === `${config.base}en` ? 'en' : 'ru';
  }
  async function renderHtml(html, locale) {
    const card = businessCardHtml(await pages(locale), config.base, locale);
    const legal = getLicenseDisclaimerHtml(locale);
    const rendered = html.includes('<!-- BUSINESS_CARD -->') ? html.replace('<!-- BUSINESS_CARD -->', card)
      : html.replace(/<article class="business-card"[\s\S]*?<\/article>/, () => card);
    return localizeHtml(rendered.replaceAll('<!-- LICENSE_DISCLAIMER -->', legal)
      .replace('<!-- BOOT_DISCLAIMER -->', legal.replaceAll('<p ', '<p data-boot-line hidden '))
      .replace('__BUSINESS_CARD_PDF__', `${config.base}${pdfName(locale)}`), locale, config.base);
  }
  return {
    name: 'business-card-html',
    enforce: 'post',
    configResolved(value) { config = value; pdfs.clear(); },
    async buildStart() {
      if (config.command !== 'build') return;
      assets = {};
      pdfs.clear();
      for (const path of await files(resolve(config.root, 'content'))) {
        if (!/\.(png|jpe?g|gif|webp|avif|svg)$/i.test(path)) continue;
        const source = await readFile(path);
        const hash = createHash('sha256').update(source).digest('hex').slice(0, 10);
        const name = relative(resolve(config.root, 'content'), path).replaceAll('\\', '/');
        const fileName = `card-assets/${hash}-${name}`;
        this.emitFile({ type: 'asset', fileName, source });
        assets[key(path)] = `${config.base}${fileName}`;
      }
      for (const locale of await locales()) this.emitFile({ type: 'asset', fileName: pdfName(locale), source: await getPdf(locale) });
    },
    async generateBundle(_options, bundle) {
      const root = bundle['index.html'];
      if (!root || root.type !== 'asset') return;
      for (const locale of await locales()) this.emitFile({ type: 'asset', fileName: `${locale}/index.html`, source: await renderHtml(String(root.source), locale) });
    },
    configureServer(server) {
      server.watcher.add(resolve(config.root, 'content'));
      server.watcher.add(resolve(config.root, 'public/images'));
      server.watcher.add(resolve(config.root, 'src/locales'));
      const refresh = (path) => {
        const normalized = path.replaceAll('\\', '/');
        const root = config.root.replaceAll('\\', '/');
        const translation = normalized.startsWith(`${root}/src/locales/`);
        if (translation || normalized.startsWith(`${root}/content/`) || normalized.startsWith(`${root}/public/images/`)) {
          pdfs.clear();
          if (translation && server.restart) void server.restart();
          else server.ws.send({ type: 'full-reload' });
        }
      };
      for (const event of ['add', 'change', 'unlink']) server.watcher.on(event, refresh);
      server.middlewares.use(async (request, response, next) => {
        const path = request.url?.split('?')[0];
        const locale = path === `${config.base}${BUSINESS_CARD_PDF}` ? 'ru'
          : path === `${config.base}${BUSINESS_CARD_PDF_EN}` ? 'en' : undefined;
        const localizedPage = ['ru', 'en'].some((language) => [`${config.base}${language}`, `${config.base}${language}/`, `${config.base}${language}/index.html`].includes(path));
        if (!locale && !localizedPage) return next();
        try {
          if (localizedPage) {
            const source = await server.transformIndexHtml(request.url, await readFile(resolve(config.root, 'index.html'), 'utf8'));
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.end(request.method === 'HEAD' ? undefined : source);
            return;
          }
          const source = await getPdf(locale);
          response.setHeader('Content-Type', 'application/pdf');
          response.setHeader('Content-Disposition', `attachment; filename="${pdfDownload(locale)}"`);
          response.setHeader('Content-Length', source.length);
          response.setHeader('Cache-Control', 'no-cache');
          response.end(request.method === 'HEAD' ? undefined : source);
        } catch (error) { next(error); }
      });
    },
    transformIndexHtml: {
      order: 'pre',
      async handler(html, context) {
        return renderHtml(html, requestLocale(context?.originalUrl ?? context?.path));
      },
    },
  };
}
