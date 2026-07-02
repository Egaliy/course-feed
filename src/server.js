import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.js';
import { createBot } from './bot.js';
import { createMaxBot } from './max-bot.js';
import { parseAccessToken } from './access-token.js';
import {
  renderFeedPage,
  renderRegistrationPage,
  renderRegistrationSuccessPage
} from './render.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const uploadDir = path.join(publicDir, 'uploads');

const port = Number(process.env.PORT || 3000);
const title = process.env.COURSE_TITLE || 'Лента курса';
const botToken = process.env.BOT_TOKEN;
const maxBotToken = process.env.MAX_BOT_TOKEN;
const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;
const adminIds = (process.env.ADMIN_IDS || '').split(',').map((id) => id.trim()).filter(Boolean);
const maxAdminIds = (process.env.MAX_ADMIN_IDS || process.env.ADMIN_IDS || '').split(',').map((id) => id.trim()).filter(Boolean);
const maxApiBase = process.env.MAX_API_BASE || undefined;
const accessSecret = process.env.ACCESS_TOKEN_SECRET || 'course-feed-access-v1';

const store = new Store(path.join(rootDir, 'data', 'db.json'));
await store.load();

const app = express();
app.disable('x-powered-by');
app.use(express.urlencoded({ extended: false }));
app.use(express.static(publicDir));

app.get('/', (req, res) => {
  const token = getAccessTokenFromQuery(req);
  if (!token) {
    res.send(renderRegistrationPage({ title }));
    return;
  }

  const access = getAccess(token);
  if (!access) {
    res.send(renderRegistrationPage({ title }));
    return;
  }

  if (!isActiveAccess(access)) {
    res.send(renderRegistrationPage({ title, state: 'expired' }));
    return;
  }

  res.send(renderFeedPage({ title, posts: store.getPosts(), access, token, view: req.query.view }));
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

app.get('/a/:token', (req, res) => {
  const access = getAccess(req.params.token);

  if (!access) {
    res.send(renderRegistrationPage({ title }));
    return;
  }

  if (!isActiveAccess(access)) {
    res.send(renderRegistrationPage({ title, state: 'expired' }));
    return;
  }

  res.send(renderFeedPage({ title, posts: store.getPosts(), access, token: req.params.token, view: req.query.view }));
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

if (!maxBotToken || !maxAdminIds.length) {
  console.warn('MAX_BOT_TOKEN or MAX_ADMIN_IDS is missing. Site started without MAX bot.');
} else {
  const maxBot = createMaxBot({
    botToken: maxBotToken,
    adminIds: maxAdminIds,
    publicBaseUrl,
    apiBase: maxApiBase
  });

  void maxBot.start().catch((error) => {
    console.error('MAX bot failed to start.');
    console.error(error);
  });

  process.once('SIGINT', () => maxBot.stop());
  process.once('SIGTERM', () => maxBot.stop());
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

function getAccess(token) {
  return parseAccessToken(token, accessSecret) || store.findAccessLink(token);
}

function isActiveAccess(access) {
  return Boolean(access) && new Date(access.expiresAt) >= new Date();
}
