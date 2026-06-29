import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.js';
import { renderPublicFeedPage } from '../src/render.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const title = process.env.COURSE_TITLE || 'Лента курса';
const store = new Store(path.join(rootDir, 'data', 'db.json'));
let loaded = false;

export default async function handler(req, res) {
  if (!loaded) {
    await store.load();
    loaded = true;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(renderPublicFeedPage({ title, posts: store.getPosts() }));
}
