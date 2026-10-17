import { marked } from 'marked';
import { t } from './i18n.js';

export function safeHref(value = '') {
  const href = value.trim();
  return /^(https?:\/\/|mailto:|\/|\.\.?\/|#)/i.test(href) && !href.startsWith('//') ? href : undefined;
}

export function resolveImageSource(href = '', markdownPath, assets = {}, base = '/') {
  if (/^https?:\/\//i.test(href)) return href;
  if (/^[a-z][\w+.-]*:/i.test(href) || href.startsWith('//')) return undefined;
  let relative;
  try { relative = decodeURIComponent(href.split(/[?#]/)[0]); } catch { return undefined; }
  const normalize = (path) => {
    const parts = [];
    for (const part of path.replace(/\\/g, '/').split('/')) {
      if (!part || part === '.') continue;
      if (part === '..' && parts.length && parts.at(-1) !== '..') parts.pop();
      else if (part !== '..' || !path.startsWith('/')) parts.push(part);
    }
    return parts.join('/');
  };
  const normalizedPath = markdownPath.replace(/\\/g, '/');
  const directory = normalizedPath.slice(0, normalizedPath.lastIndexOf('/') + 1);
  const target = relative.startsWith('/') ? normalize(`..${relative}`) : normalize(`${directory}${relative}`);
  const entry = Object.entries(assets).find(([path]) => normalize(path) === target);
  if (entry) return entry[1];
  return relative.startsWith('/') ? `${base}${relative.replace(/^\//, '')}` : undefined;
}

export function inlineRuns(tokens = [], style = {}) {
  return tokens.flatMap((token) => {
    if (token.type === 'br') return [{ text: '\n', ...style }];
    if (token.type === 'strong') return inlineRuns(token.tokens, { ...style, bold: true });
    if (token.type === 'em') return inlineRuns(token.tokens, { ...style, italic: true });
    if (token.type === 'link') return inlineRuns(token.tokens, { ...style, href: safeHref(token.href) });
    if (token.type === 'image') return [{ ...style, type: 'image', text: token.text, source: token.href, title: token.title }];
    if (token.type === 'codespan') return [{ ...style, text: token.text, code: true }];
    if (token.tokens) return inlineRuns(token.tokens, style);
    return [{ ...style, text: token.text ?? token.raw ?? '' }];
  });
}

export function markdownBlocks(tokens) {
  return tokens.flatMap((token) => {
    if (token.type === 'space') return [];
    if (token.type === 'heading') return [{ type: 'heading', depth: token.depth, runs: inlineRuns(token.tokens) }];
    if (token.type === 'hr') return [{ type: 'rule', runs: [] }];
    if (token.type === 'code') return [{ type: 'code', runs: [{ text: token.text, code: true }] }];
    if (token.type === 'blockquote') return markdownBlocks(token.tokens).map((block) => ({ ...block, quote: true }));
    if (token.type === 'list') return token.items.flatMap((item, index) => {
      const blocks = markdownBlocks(item.tokens);
      if (blocks[0]) blocks[0].runs.unshift({ text: token.ordered ? `${Number(token.start) + index}. ` : '• ' });
      return blocks.map((block) => ({ ...block, type: block.type === 'paragraph' ? 'list' : block.type }));
    });
    if (token.type === 'table') return [token.header, ...token.rows].map((row) => ({
      type: 'paragraph', runs: row.flatMap((cell, index) => [...(index ? [{ text: ' | ' }] : []), ...inlineRuns(cell.tokens)]),
    }));
    const runs = token.tokens ? inlineRuns(token.tokens) : [{ text: token.text ?? token.raw ?? '' }];
    const blocks = [];
    let paragraph = [];
    for (const run of runs) {
      if (run.type === 'image') {
        if (paragraph.some((item) => item.text.trim())) blocks.push({ type: 'paragraph', runs: paragraph });
        paragraph = [];
        blocks.push({ type: 'image', runs: [run] });
      } else paragraph.push(run);
    }
    if (paragraph.some((item) => item.text.trim())) blocks.push({ type: 'paragraph', runs: paragraph });
    return blocks;
  });
}

export function parseMarkdownFile(path, source, assets = {}, base = '/', locale = 'ru') {
  const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const metadata = {};
  const frontmatter = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (frontmatter) for (const line of frontmatter[1].split('\n')) {
    const pair = line.match(/^([\w-]+):\s*(.*?)\s*$/);
    if (pair) metadata[pair[1]] = pair[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  const id = path.split(/[\\/]/).at(-1).replace(/\.md$/i, '');
  const tokens = marked.lexer(normalized.slice(frontmatter?.[0].length ?? 0));
  const titleIndex = tokens.findIndex((token) => token.type === 'heading' && token.depth === 1);
  const title = titleIndex < 0 ? id : inlineRuns(tokens[titleIndex].tokens).map((run) => run.text).join('');
  if (titleIndex >= 0) tokens.splice(titleIndex, 1);
  const contacts = [];
  if (id === 'about') {
    const start = tokens.findIndex((token) => token.type === 'heading' && /^(контакты|contacts)$/i.test(token.text.trim()));
    if (start >= 0) {
      let end = start + 1;
      while (end < tokens.length && !(tokens[end].type === 'heading' && tokens[end].depth <= tokens[start].depth)) end++;
      for (const block of markdownBlocks(tokens.splice(start, end - start))) for (const run of block.runs) {
        if (run.href) contacts.push({ label: run.text, href: run.href, value: run.href.replace(/^(https?:\/\/|mailto:)/, '').replace(/\/$/, '') });
      }
    }
  }
  const blocks = markdownBlocks(tokens);
  for (const block of blocks) for (const run of block.runs) {
    if (run.type === 'image') run.src = resolveImageSource(run.source, path, assets, base);
  }
  return { id, title, category: metadata.category ?? t(id === 'about' ? 'markdown.personalCategory' : 'markdown.projectCategory', {}, locale), metadata, locale,
    order: Number.isFinite(Number(metadata.order)) ? Number(metadata.order) : Infinity,
    blocks, contacts, tokens };
}

export function loadMarkdownFiles(files, assets = {}, base = '/', locale = 'ru') {
  const pages = Object.entries(files).map(([path, source]) => parseMarkdownFile(path, source, assets, base, locale));
  const about = pages.find((page) => page.id === 'about');
  if (!about) throw new Error(t('markdown.missingAbout', {}, locale));
  return { about, locale, projects: pages.filter((page) => page !== about)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, locale) || a.id.localeCompare(b.id)) };
}

export const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
export function runsHtml(runs) {
  return runs.map((run) => {
    let text = escapeHtml(run.text).replace(/\n/g, '<br>');
    if (run.type === 'image' && run.src) text = `<img src="${escapeHtml(run.src)}" alt="${escapeHtml(run.text)}"${run.title ? ` title="${escapeHtml(run.title)}"` : ''}>`;
    if (run.code) text = `<code>${text}</code>`;
    if (run.bold) text = `<strong>${text}</strong>`;
    if (run.italic) text = `<em>${text}</em>`;
    if (run.href) text = `<a href="${escapeHtml(run.href)}" ${/^https?:/.test(run.href) ? 'target="_blank" rel="noopener noreferrer"' : ''}>${text}</a>`;
    return text;
  }).join('');
}

export function blocksHtml(blocks) {
  return blocks.map((block) => {
    if (block.type === 'rule') return '<hr>';
    const tag = block.type === 'heading' ? `h${Math.min(6, block.depth)}` : block.type === 'code' ? 'pre' : 'p';
    const html = `<${tag}>${runsHtml(block.runs)}</${tag}>`;
    return block.quote ? `<blockquote>${html}</blockquote>` : html;
  }).join('');
}
