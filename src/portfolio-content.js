import { loadMarkdownFiles } from './markdown.js';
import { getLocale } from './i18n.js';

const files = {
  ru: import.meta.glob('../content/ru/*.md', { query: '?raw', import: 'default', eager: true }),
  en: import.meta.glob('../content/en/*.md', { query: '?raw', import: 'default', eager: true }),
};
const images = import.meta.glob('../content/**/*.{png,jpg,jpeg,gif,webp,avif,svg}', { query: '?url', import: 'default', eager: true });
const content = new Map();

export function getPortfolioContent(locale = getLocale()) {
  if (!content.has(locale)) {
    const { about, projects } = loadMarkdownFiles(files[locale], images, import.meta.env.BASE_URL, locale);
    content.set(locale, {
      about, projects, locale,
      profile: {
        name: about.title,
        handle: about.metadata.handle ?? '',
        photo: about.metadata.photo ?? '/images/portrait.jpg',
        contacts: about.contacts,
      },
    });
  }
  return content.get(locale);
}
