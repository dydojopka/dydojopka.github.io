import { loadMarkdownFiles } from './markdown.js';

const files = import.meta.glob('../content/*.md', { query: '?raw', import: 'default', eager: true });
const images = import.meta.glob('../content/**/*.{png,jpg,jpeg,gif,webp,avif,svg}', { query: '?url', import: 'default', eager: true });
export const { about, projects } = loadMarkdownFiles(files, images, import.meta.env.BASE_URL);
export const profile = {
  name: about.title,
  handle: about.metadata.handle ?? '',
  photo: about.metadata.photo ?? '/images/portrait.jpg',
  contacts: about.contacts,
};
