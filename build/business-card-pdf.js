import { createRequire } from 'node:module';
import pdfmake from 'pdfmake';
import { inlineRuns, safeHref } from '../src/markdown.js';

const require = createRequire(import.meta.url);
const fonts = Object.fromEntries(Object.entries({
  normal: 'Roboto-Regular.ttf', bold: 'Roboto-Medium.ttf',
  italics: 'Roboto-Italic.ttf', bolditalics: 'Roboto-MediumItalic.ttf',
}).map(([style, name]) => [style, require.resolve(`pdfmake/fonts/Roboto/${name}`)]));
pdfmake.addFonts({ Roboto: fonts });
pdfmake.setLocalAccessPolicy((path) => Object.values(fonts).includes(path));
pdfmake.setUrlAccessPolicy(() => false);

export function businessCardPdfDefinition({ about, projects }, { portrait, images = {} } = {}) {
  function pdfRun(run) {
    return {
      text: run.text.replace(/↗/g, '').replace(/[\u2010-\u2015]/g, '-'),
      ...(run.bold ? { bold: true } : {}), ...(run.italic ? { italics: true } : {}),
      ...(run.code ? { background: '#f1f1ea' } : {}),
      ...(safeHref(run.href) ? { link: run.href, color: '#245044', decoration: 'underline' } : {}),
    };
  }
  function richText(tokens) {
    return inlineRuns(tokens).map(pdfRun);
  }
  function markdown(page, headingOffset = 0) {
    const imageUrls = new Map(page.blocks.flatMap((block) => block.runs)
      .filter((run) => run.type === 'image').map((run) => [run.source, run.src]));
    function render(tokens) {
      return tokens.flatMap((token) => {
        if (token.type === 'space') return [];
        if (token.type === 'hr') return [{ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 507, y2: 0, lineWidth: 0.5, lineColor: '#d8d7ce' }], margin: [0, 8, 0, 12] }];
        if (token.type === 'heading') return [{ text: richText(token.tokens), style: token.depth + headingOffset <= 2 ? 'heading' : 'subheading', headlineLevel: token.depth + headingOffset }];
        if (token.type === 'code') return [{ text: token.text, fontSize: 10, background: '#f1f1ea', margin: [0, 0, 0, 12] }];
        if (token.type === 'blockquote') return [{ stack: render(token.tokens), margin: [14, 0, 0, 0], color: '#566258' }];
        if (token.type === 'list') return [{
          [token.ordered ? 'ol' : 'ul']: token.items.map((item) => ({ stack: render(item.tokens) })),
          ...(token.ordered ? { start: Number(token.start) } : {}), margin: [0, 0, 0, 10],
        }];
        if (token.type === 'table') return [{ table: {
          headerRows: 1, widths: token.header.map(() => '*'),
          body: [token.header.map((cell) => ({ text: richText(cell.tokens), bold: true })),
            ...token.rows.map((row) => row.map((cell) => ({ text: richText(cell.tokens) })))],
        }, layout: 'lightHorizontalLines', margin: [0, 0, 0, 12] }];
        const runs = token.tokens ? inlineRuns(token.tokens) : [{ text: token.text ?? token.raw ?? '' }];
        const nodes = [];
        let text = [];
        const flush = () => {
          if (text.some((run) => run.text.trim())) nodes.push({ text, margin: [0, 0, 0, token.type === 'text' ? 4 : 12] });
          text = [];
        };
        for (const run of runs) {
          if (run.type === 'image') {
            flush();
            const image = images[imageUrls.get(run.source)];
            nodes.push(image ? { image, fit: [220, 100], margin: [0, 0, 0, 14] }
              : { text: run.text, italics: true, margin: [0, 0, 0, 12] });
          } else text.push(pdfRun(run));
        }
        flush();
        return nodes;
      });
    }
    return render(page.tokens);
  }
  return {
    pageSize: 'A4', pageMargins: [44, 42, 44, 42], language: 'ru-RU',
    info: { title: `${about.title} - визитка`, author: about.title, subject: 'Профиль, контакты и проекты' },
    defaultStyle: { font: 'Roboto', fontSize: 11.5, lineHeight: 1.25, color: '#252922' },
    styles: {
      title: { fontSize: 28, bold: true, margin: [0, 0, 0, 20] },
      heading: { fontSize: 18, bold: true, margin: [0, 18, 0, 10] },
      subheading: { fontSize: 13.5, bold: true, margin: [0, 12, 0, 8] },
    },
    content: [
      { text: about.title, style: 'title', headlineLevel: 1 },
      ...(portrait ? [{ image: portrait, width: 84, margin: [0, 0, 0, 18] }] : []),
      ...markdown(about),
      { text: 'Контакты', style: 'heading', headlineLevel: 2 },
      { ul: about.contacts.map((contact) => ({ text: [
        { text: contact.label, link: contact.href, color: '#245044', decoration: 'underline' },
        { text: `: ${contact.value}` },
      ], margin: [0, 0, 0, 5] })) },
      ...projects.map((page, index) => ({
        id: `project-${page.id}`, ...(index === 0 ? { pageBreak: 'before' } : {}),
        stack: [{ text: page.title, style: 'heading', headlineLevel: 2 }, ...markdown(page, 1)],
      })),
    ],
    pageBreakBefore: (node, container) => {
      if (node.id?.startsWith('project-') && node.pageNumbers.length > 1) {
        return container.getPreviousNodesOnPage().some((previous) => !previous.stack);
      }
      return Boolean(node.headlineLevel && !container.getFollowingNodesOnPage().length);
    },
    footer: (page, count) => ({ text: `${page} / ${count}`, alignment: 'right', fontSize: 9, color: '#67736a', margin: [44, 12, 44, 0] }),
  };
}

export function createBusinessCardPdf(pages, assets) {
  return pdfmake.createPdf(businessCardPdfDefinition(pages, assets)).getBuffer();
}
