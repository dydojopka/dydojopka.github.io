import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { loadMarkdownFiles } from '../src/markdown.js';
import { businessCardHtml, businessCardPhotoUrl } from '../src/business-card-html.js';
import { licenseDisclaimerHtml } from './license-disclaimer-html.js';

export const BUSINESS_CARD_PDF = 'business-card.pdf';
export const BUSINESS_CARD_PDF_DOWNLOAD = 'evgeny-ashroev-business-card.pdf';

export function businessCardPlugin() {
  let config;
  let assets = {};
  let pdf;
  async function files(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    return (await Promise.all(entries.map((entry) => entry.isDirectory()
      ? files(resolve(directory, entry.name)) : resolve(directory, entry.name)))).flat();
  }
  const key = (path) => `../${relative(config.root, path).replaceAll('\\', '/')}`;
  async function pages() {
    const markdown = {};
    const imageUrls = { ...assets };
    for (const path of await files(resolve(config.root, 'content'))) {
      if (/\.md$/i.test(path) && dirname(path) === resolve(config.root, 'content')) markdown[key(path)] = await readFile(path, 'utf8');
      else if (config.command === 'serve') imageUrls[key(path)] = `${config.base}${key(path).slice(3)}`;
    }
    return loadMarkdownFiles(markdown, imageUrls, config.base);
  }
  async function generatePdf() {
    const content = await pages();
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
    return createBusinessCardPdf(content, { images, portrait: images[portraitUrl] });
  }
  function getPdf() {
    pdf ??= generatePdf().catch((error) => { pdf = undefined; throw error; });
    return pdf;
  }
  return {
    name: 'business-card-html',
    configResolved(value) { config = value; pdf = undefined; },
    async buildStart() {
      if (config.command !== 'build') return;
      assets = {};
      pdf = undefined;
      for (const path of await files(resolve(config.root, 'content'))) {
        if (!/\.(png|jpe?g|gif|webp|avif|svg)$/i.test(path)) continue;
        const source = await readFile(path);
        const hash = createHash('sha256').update(source).digest('hex').slice(0, 10);
        const name = relative(resolve(config.root, 'content'), path).replaceAll('\\', '/');
        const fileName = `card-assets/${hash}-${name}`;
        this.emitFile({ type: 'asset', fileName, source });
        assets[key(path)] = `${config.base}${fileName}`;
      }
      this.emitFile({ type: 'asset', fileName: BUSINESS_CARD_PDF, source: await getPdf() });
    },
    configureServer(server) {
      server.watcher.add(resolve(config.root, 'content'));
      server.watcher.add(resolve(config.root, 'public/images'));
      const refresh = (path) => {
        const normalized = path.replaceAll('\\', '/');
        const root = config.root.replaceAll('\\', '/');
        if (normalized.startsWith(`${root}/content/`) || normalized.startsWith(`${root}/public/images/`)) {
          pdf = undefined;
          server.ws.send({ type: 'full-reload' });
        }
      };
      for (const event of ['add', 'change', 'unlink']) server.watcher.on(event, refresh);
      server.middlewares.use(async (request, response, next) => {
        if (request.url?.split('?')[0] !== `${config.base}${BUSINESS_CARD_PDF}`) return next();
        try {
          const source = await getPdf();
          response.setHeader('Content-Type', 'application/pdf');
          response.setHeader('Content-Disposition', `attachment; filename="${BUSINESS_CARD_PDF_DOWNLOAD}"`);
          response.setHeader('Content-Length', source.length);
          response.setHeader('Cache-Control', 'no-cache');
          response.end(request.method === 'HEAD' ? undefined : source);
        } catch (error) { next(error); }
      });
    },
    transformIndexHtml: {
      order: 'pre',
      async handler(html) {
        return html.replace('<!-- BUSINESS_CARD -->', businessCardHtml(await pages(), config.base))
          .replaceAll('<!-- LICENSE_DISCLAIMER -->', licenseDisclaimerHtml)
          .replace('<!-- BOOT_DISCLAIMER -->', licenseDisclaimerHtml.replaceAll('<p>', '<p data-boot-line hidden>'))
          .replace('__BUSINESS_CARD_PDF__', `${config.base}${BUSINESS_CARD_PDF}`);
      },
    },
  };
}
