import { escapeHtml, inlineRuns, runsHtml } from './markdown.js';
import { t } from './i18n.js';

export function semanticMarkdownHtml(page, headingOffset = 0) {
  const images = new Map(page.blocks.flatMap((block) => block.runs)
    .filter((run) => run.type === 'image').map((run) => [run.source, run.src]));
  const inline = (tokens) => runsHtml(inlineRuns(tokens).map((run) =>
    run.type === 'image' ? { ...run, src: images.get(run.source) } : run));
  function render(tokens) {
    return tokens.map((token) => {
      if (token.type === 'space') return '';
      if (token.type === 'hr') return '<hr>';
      if (token.type === 'heading') {
        const level = Math.min(6, Math.max(2, token.depth + headingOffset));
        return `<h${level}>${inline(token.tokens)}</h${level}>`;
      }
      if (token.type === 'code') return `<pre><code>${escapeHtml(token.text)}</code></pre>`;
      if (token.type === 'blockquote') return `<blockquote>${render(token.tokens)}</blockquote>`;
      if (token.type === 'list') {
        const tag = token.ordered ? 'ol' : 'ul';
        const start = token.ordered && token.start !== 1 ? ` start="${Number(token.start)}"` : '';
        return `<${tag}${start}>${token.items.map((item) => `<li>${render(item.tokens)}</li>`).join('')}</${tag}>`;
      }
      if (token.type === 'table') {
        const row = (cells, tag) => `<tr>${cells.map((cell) => `<${tag}>${inline(cell.tokens)}</${tag}>`).join('')}</tr>`;
        return `<table><thead>${row(token.header, 'th')}</thead><tbody>${token.rows.map((cells) => row(cells, 'td')).join('')}</tbody></table>`;
      }
      return `<p>${token.tokens ? inline(token.tokens) : escapeHtml(token.text ?? token.raw ?? '')}</p>`;
    }).join('\n');
  }
  return render(page.tokens);
}

export function businessCardPhotoUrl(about, base = '/') {
  const photo = about.metadata.photo ?? '/images/portrait.jpg';
  return photo.startsWith('/') ? `${base}${photo.slice(1)}` : undefined;
}

export function businessCardHtml({ about, projects, locale: contentLocale }, base = '/', locale = contentLocale ?? 'ru') {
  const photoUrl = businessCardPhotoUrl(about, base);
  const contactsTitle = escapeHtml(t('card.contacts', {}, locale));
  const projectsTitle = escapeHtml(t('card.projects', {}, locale));
  return `<article class="business-card" aria-labelledby="card-title">
    <header><h1 id="card-title" tabindex="-1">${escapeHtml(about.title)}</h1></header>
    <div class="card-profile">
      ${photoUrl ? `<img class="card-portrait" src="${escapeHtml(photoUrl)}" alt="${escapeHtml(about.title)}" width="809" height="1078">` : ''}
      ${semanticMarkdownHtml(about)}
    </div>
    <section aria-labelledby="card-contacts"><h2 id="card-contacts">${contactsTitle}</h2>
      <ul>${about.contacts.map((contact) => `<li><a href="${escapeHtml(contact.href)}">${escapeHtml(contact.label)}</a>: ${escapeHtml(contact.value)}</li>`).join('')}</ul>
    </section>
    <section aria-label="${projectsTitle}">${projects.map((page) => `<section aria-labelledby="project-${escapeHtml(page.id)}">
      <h2 id="project-${escapeHtml(page.id)}">${escapeHtml(page.title)}</h2>${semanticMarkdownHtml(page, 1)}
    </section>`).join('\n')}</section>
  </article>`;
}
