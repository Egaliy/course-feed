import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.js';
import { createBot } from './bot.js';
import { parseAccessToken } from './access-token.js';
import { deleteBlobPost, hasBlobStorage, readBlobState } from './blob-storage.js';
import {
  renderFeedPage,
  renderManagePage,
  renderRegistrationPage,
  renderRegistrationSuccessPage
} from './render.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const uploadDir = path.join(publicDir, 'uploads');

const port = Number(process.env.PORT || 3000);
const title = getTitle();
const botToken = process.env.BOT_TOKEN;
const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;
const adminIds = (process.env.ADMIN_IDS || '').split(',').map((id) => id.trim()).filter(Boolean);
const accessSecret = process.env.ACCESS_TOKEN_SECRET || 'course-feed-access-v1';
const enableLocalBotPolling = process.env.ENABLE_LOCAL_BOT_POLLING === 'true';
const useBlobStorage = hasBlobStorage();

const store = new Store(path.join(rootDir, 'data', 'db.json'));
await store.load();

const app = express();
app.disable('x-powered-by');
app.use(express.urlencoded({ extended: false }));
app.use(express.static(publicDir));

app.get('/', async (req, res) => {
  const state = await getState();

  if (isManageRequest(req)) {
    res.send(renderManagePage({
      title,
      posts: getPosts(state),
      adminKey: getSiteAdminKey(),
      notice: String(req.query.notice || '')
    }));
    return;
  }

  const token = getAccessTokenFromQuery(req);
  if (!token) {
    res.send(renderRegistrationPage({ title }));
    return;
  }

  const access = getAccess(token, state);
  if (!access) {
    res.send(renderRegistrationPage({ title }));
    return;
  }

  if (!isActiveAccess(access)) {
    res.send(renderRegistrationPage({ title, state: 'expired' }));
    return;
  }

  res.send(renderFeedPage({ title, posts: getPosts(state), access, token, view: req.query.view }));
});

app.post('/', async (req, res) => {
  if (!isManageRequest(req)) {
    res.status(404).send(renderRegistrationPage({ title }));
    return;
  }

  const ids = getPostIdsFromBody(req.body);
  await Promise.all(ids.map((id) => deleteBlobPost(id)));
  res.redirect(303, `/?manage=${encodeURIComponent(getSiteAdminKey())}&notice=${encodeURIComponent(`Удалено: ${ids.length}`)}`);
});

app.post('/register', async (req, res) => {
  const name = String(req.body.name || '').trim();
  const contact = String(req.body.contact || '').trim();
  const note = String(req.body.note || '').trim();

  if (!name || !contact) {
    res.status(400).send(renderRegistrationPage({
      title,
      error: 'Укажите имя и контакт для связи.',
      values: { name, contact, note }
    }));
    return;
  }

  const registration = await store.addRegistration({ name, contact, note });
  await notifyAdminsAboutRegistration({ botToken, adminIds, registration });
  res.send(renderRegistrationSuccessPage({ title }));
});

app.get('/feed', (req, res) => {
  res.redirect('/');
});

app.get('/a/:token', async (req, res) => {
  const state = await getState();
  const access = getAccess(req.params.token, state);

  if (!access) {
    res.send(renderRegistrationPage({ title }));
    return;
  }

  if (!isActiveAccess(access)) {
    res.send(renderRegistrationPage({ title, state: 'expired' }));
    return;
  }

  res.send(renderFeedPage({ title, posts: getPosts(state), access, token: req.params.token, view: req.query.view }));
});

app.listen(port, () => {
  console.log(`Site is running on http://localhost:${port}`);
});

function getTitle() {
  const value = String(process.env.COURSE_TITLE || '').trim();
  if (!value || value.includes('?') || value.includes('Р')) {
    return 'Лента курса';
  }
  return value;
}

if (!botToken || !adminIds.length) {
  console.warn('BOT_TOKEN or ADMIN_IDS is missing. Site started without Telegram bot.');
} else if (!enableLocalBotPolling) {
  console.warn('Telegram polling is disabled. Set ENABLE_LOCAL_BOT_POLLING=true only for local bot testing.');
} else {
  const bot = createBot({ botToken, adminIds, publicBaseUrl, store, uploadDir });
  const me = await bot.telegram.getMe();
  try {
    await bot.telegram.setMyCommands([
      { command: 'link', description: 'Создать ссылку доступа' }
    ]);
  } catch (error) {
    console.warn('Could not update Telegram bot commands:', error.message);
  }
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

async function notifyAdminsAboutRegistration({ botToken, adminIds, registration }) {
  if (!botToken || !adminIds.length) return;

  const lines = [
    'Новая заявка на курс',
    '',
    `Имя: ${registration.name}`,
    `Контакт: ${registration.contact}`
  ];

  if (registration.note) {
    lines.push(`Комментарий: ${registration.note}`);
  }

  lines.push('', `Время: ${formatDateTime(registration.createdAt)}`);

  const message = lines.join('\n');
  const results = await Promise.allSettled(
    adminIds.map((chatId) => sendTelegramMessage({ botToken, chatId, text: message }))
  );

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('Registration notification failed:', result.reason);
    }
  }
}

async function sendTelegramMessage({ botToken, chatId, text }) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });

  if (!response.ok) {
    throw new Error(`Telegram sendMessage failed: ${response.status} ${await response.text()}`);
  }
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}

function getAccessTokenFromQuery(req) {
  return String(req.query.k || req.query.code || req.query.access || '').trim();
}

function isManageRequest(req) {
  const key = getSiteAdminKey();
  return Boolean(key) && String(req.query.manage || '') === key;
}

function getSiteAdminKey() {
  return process.env.SITE_ADMIN_KEY || process.env.TELEGRAM_WEBHOOK_SECRET || '';
}

function getPostIdsFromBody(body) {
  if (typeof body === 'string') {
    return new URLSearchParams(body).getAll('postId').filter(Boolean);
  }

  const value = body?.postId;
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value) return [String(value)];
  return [];
}

async function getState() {
  if (useBlobStorage) {
    return readBlobState();
  }

  return {
    posts: store.getPosts(),
    accessLinks: store.state.accessLinks || []
  };
}

function getPosts(state) {
  return [...(state.posts || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getAccess(token, state) {
  return parseAccessToken(token, accessSecret)
    || (state.accessLinks || []).find((link) => link.token === token);
}

function isActiveAccess(access) {
  return Boolean(access) && new Date(access.expiresAt) >= new Date();
}
