import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { loadMarkdownFiles } from '../src/markdown.js';
import { businessCardHtml } from '../src/business-card-html.js';

export function businessCardPlugin() {
  let config;
  let assets = {};
  async function files(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    return (await Promise.all(entries.map((entry) => entry.isDirectory()
      ? files(resolve(directory, entry.name)) : resolve(directory, entry.name)))).flat();
  }
  const key = (path) => `../${relative(config.root, path).replaceAll('\\', '/')}`;
  return {
    name: 'business-card-html',
    configResolved(value) { config = value; },
    async buildStart() {
      if (config.command !== 'build') return;
      assets = {};
      for (const path of await files(resolve(config.root, 'content'))) {
        if (!/\.(png|jpe?g|gif|webp|avif|svg)$/i.test(path)) continue;
        const source = await readFile(path);
        const hash = createHash('sha256').update(source).digest('hex').slice(0, 10);
        const name = relative(resolve(config.root, 'content'), path).replaceAll('\\', '/');
        const fileName = `card-assets/${hash}-${name}`;
        this.emitFile({ type: 'asset', fileName, source });
        assets[key(path)] = `${config.base}${fileName}`;
      }
    },
    configureServer(server) {
      server.watcher.add(resolve(config.root, 'content'));
      const refresh = (path) => {
        if (path.replaceAll('\\', '/').startsWith(`${config.root.replaceAll('\\', '/')}/content/`)) {
          server.ws.send({ type: 'full-reload' });
        }
      };
      for (const event of ['add', 'change', 'unlink']) server.watcher.on(event, refresh);
    },
    transformIndexHtml: {
      order: 'pre',
      async handler(html) {
        const markdown = {};
        const imageUrls = { ...assets };
        for (const path of await files(resolve(config.root, 'content'))) {
          if (/\.md$/i.test(path) && dirname(path) === resolve(config.root, 'content')) markdown[key(path)] = await readFile(path, 'utf8');
          else if (config.command === 'serve') imageUrls[key(path)] = `${config.base}${key(path).slice(3)}`;
        }
        return html.replace('<!-- BUSINESS_CARD -->', businessCardHtml(loadMarkdownFiles(markdown, imageUrls, config.base), config.base));
      },
    },
  };
}
