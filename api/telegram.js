import { createAccessToken } from '../src/access-token.js';
import { addBlobPost, createBlobAccessLink, hasBlobStorage, uploadTelegramFileToBlob } from '../src/blob-storage.js';
import { extractMedia, extractText } from '../src/media.js';

const durations = [
  { label: '1 месяц', months: 1 },
  { label: '3 месяца', months: 3 },
  { label: '6 месяцев', months: 6 },
  { label: '9 месяцев', months: 9 }
];

export default async function handler(req, res) {
  if (req.method === 'GET') {
    res.status(200).send('Telegram webhook is ready.');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  if (!isValidSecret(req)) {
    res.status(401).send('Unauthorized');
    return;
  }

  const botToken = process.env.BOT_TOKEN;
  if (!botToken) {
    res.status(500).send('BOT_TOKEN is missing');
    return;
  }

  try {
    const update = parseUpdate(req.body);
    await handleUpdate({ update, botToken });
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook failed:', error);
    res.status(200).json({ ok: true });
  }
}

async function handleUpdate({ update, botToken }) {
  const message = update.message;
  const callback = update.callback_query;

  if (callback) {
    await handleCallback({ callback, botToken });
    return;
  }

  if (!message) return;

  const chatId = message.chat?.id;
  const userId = String(message.from?.id || '');
  const text = String(message.text || '').trim();
  if (!chatId) return;

  if (!isAdmin(userId)) {
    await sendMessage({ botToken, chatId, text: 'Нет доступа.' });
    return;
  }

  if (text === '/start') {
    await deleteMessage({ botToken, chatId, messageId: message.message_id });
    await sendMessage({
      botToken,
      chatId,
      text: 'Бот работает на Vercel. Отправьте текст, фото, видео, голосовое или файл для публикации. Для ссылки ученику используйте /link.'
    });
    return;
  }

  if (text === '/link') {
    await deleteMessage({ botToken, chatId, messageId: message.message_id });
    await sendMessage({
      botToken,
      chatId,
      text: 'На какой срок выдать доступ ученику?',
      replyMarkup: {
        inline_keyboard: [durations.map((item) => ({
          text: item.label,
          callback_data: `link:${item.months}`
        }))]
      }
    });
    return;
  }

  if (text.startsWith('/')) return;

  await publishMessage({ message, botToken, chatId });
}

async function publishMessage({ message, botToken, chatId }) {
  if (!hasBlobStorage()) {
    await sendMessage({
      botToken,
      chatId,
      text: 'Хранилище Vercel Blob еще не подключено. Добавьте BLOB_READ_WRITE_TOKEN в переменные Vercel.'
    });
    return;
  }

  const media = [];

  for (const item of extractMedia(message)) {
    const file = await uploadTelegramFileToBlob({
      botToken,
      fileId: item.fileId,
      name: item.name
    });
    media.push({ ...item, ...file });
  }

  const text = extractText(message);
  if (!text && !media.length) return;

  await addBlobPost({ text, media });
  await sendMessage({ botToken, chatId, text: 'Опубликовано.' });
}

async function handleCallback({ callback, botToken }) {
  const userId = String(callback.from?.id || '');
  const chatId = callback.message?.chat?.id;
  const payload = String(callback.data || '');
  if (!chatId) return;

  if (!isAdmin(userId)) {
    await answerCallback({ botToken, callbackId: callback.id, text: 'Нет доступа.' });
    return;
  }

  const match = payload.match(/^link:(\d+)$/);
  if (!match) return;

  const months = Number(match[1]);
  const url = await createAccessUrl(months);

  await answerCallback({ botToken, callbackId: callback.id, text: 'Ссылка создана' });
  await deleteMessage({ botToken, chatId, messageId: callback.message.message_id });
  await sendMessage({
    botToken,
    chatId,
    text: `Ссылка-доступ на ${monthsText(months)}:\n${url}`
  });
}

async function createAccessUrl(months) {
  const baseUrl = (process.env.PUBLIC_BASE_URL || 'https://course-feed.vercel.app').replace(/\/$/, '');

  if (hasBlobStorage()) {
    const link = await createBlobAccessLink(months);
    return `${baseUrl}/a/${link.token}`;
  }

  const token = createAccessToken({ months, secret: getAccessSecret() });
  return `${baseUrl}/?k=${token}`;
}

async function sendMessage({ botToken, chatId, text, replyMarkup }) {
  return telegramRequest({
    botToken,
    method: 'sendMessage',
    body: {
      chat_id: chatId,
      text,
      reply_markup: replyMarkup
    }
  });
}

async function deleteMessage({ botToken, chatId, messageId }) {
  if (!messageId) return;
  await telegramRequest({
    botToken,
    method: 'deleteMessage',
    body: {
      chat_id: chatId,
      message_id: messageId
    }
  }).catch(() => {});
}

async function answerCallback({ botToken, callbackId, text }) {
  return telegramRequest({
    botToken,
    method: 'answerCallbackQuery',
    body: {
      callback_query_id: callbackId,
      text
    }
  });
}

async function telegramRequest({ botToken, method, body }) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Telegram ${method} failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

function isValidSecret(req) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return true;
  return req.headers['x-telegram-bot-api-secret-token'] === expected;
}

function parseUpdate(body) {
  if (typeof body === 'string') return JSON.parse(body);
  return body || {};
}

function isAdmin(userId) {
  return getAdminIds().includes(String(userId));
}

function getAdminIds() {
  return String(process.env.ADMIN_IDS || '').split(',').map((id) => id.trim()).filter(Boolean);
}

function getAccessSecret() {
  return process.env.ACCESS_TOKEN_SECRET || 'course-feed-access-v1';
}

function monthsText(months) {
  if (months === 1) return '1 месяц';
  if (months > 1 && months < 5) return `${months} месяца`;
  return `${months} месяцев`;
}
