import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.js';
import { createBot } from './bot.js';
import { renderExpiredPage, renderFeedPage, renderMissingPage, renderPublicFeedPage } from './render.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const uploadDir = path.join(publicDir, 'uploads');

const port = Number(process.env.PORT || 3000);
const title = process.env.COURSE_TITLE || 'Лента курса';
const botToken = process.env.BOT_TOKEN;
const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;
const adminIds = (process.env.ADMIN_IDS || '').split(',').map((id) => id.trim()).filter(Boolean);

const store = new Store(path.join(rootDir, 'data', 'db.json'));
await store.load();

const app = express();
app.disable('x-powered-by');
app.use(express.static(publicDir));

app.get('/', (req, res) => {
  res.send(renderPublicFeedPage({ title, posts: store.getPosts() }));
});

app.get('/a/:token', (req, res) => {
  const access = store.findAccessLink(req.params.token);

  if (!access) {
    res.status(404).send(renderMissingPage({ title }));
    return;
  }

  if (new Date(access.expiresAt) < new Date()) {
    res.status(403).send(renderExpiredPage({ title }));
    return;
  }

  res.send(renderFeedPage({ title, posts: store.getPosts(), access }));
});

app.listen(port, () => {
  console.log(`Site is running on http://localhost:${port}`);
});

if (!botToken || !adminIds.length) {
  console.warn('BOT_TOKEN or ADMIN_IDS is missing. Site started without Telegram bot.');
} else {
  const bot = createBot({ botToken, adminIds, publicBaseUrl, store, uploadDir });
  const me = await bot.telegram.getMe();
  console.log(`Telegram bot @${me.username || me.first_name} is reachable. Starting polling...`);

  void bot.launch()
    .then(() => console.log('Telegram bot is running.'))
    .catch((error) => {
      console.error('Telegram bot failed to start.');
      console.error(error);
    });

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
