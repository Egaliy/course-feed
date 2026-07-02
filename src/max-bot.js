import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createAccessToken } from './access-token.js';

const durations = [
  { label: '1 месяц', months: 1 },
  { label: '3 месяца', months: 3 },
  { label: '6 месяцев', months: 6 },
  { label: '9 месяцев', months: 9 }
];

const defaultApiBase = 'https://botapi.tamtam.chat';

export function createMaxBot({ botToken, adminIds, publicBaseUrl, apiBase = defaultApiBase }) {
  const client = createMaxClient({ botToken, apiBase });
  let stopped = false;
  let marker = null;

  async function start() {
    console.log('MAX bot polling is starting...');

    while (!stopped) {
      try {
        const data = await client.getUpdates({ marker });
        marker = data.marker || marker;

        for (const update of data.updates || []) {
          await handleUpdate({ update, client, adminIds, publicBaseUrl });
        }
      } catch (error) {
        console.error('MAX bot polling failed:', error.message);
        await wait(2500);
      }
    }
  }

  function stop() {
    stopped = true;
  }

  return { start, stop };
}

function createMaxClient({ botToken, apiBase }) {
  const base = String(apiBase || defaultApiBase).replace(/\/$/, '');

  async function request(method, endpoint, { query = {}, body } = {}) {
    const url = new URL(`${base}${endpoint}`);
    url.searchParams.set('access_token', botToken);

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      throw new Error(`MAX API ${endpoint} failed: ${response.status} ${await response.text()}`);
    }

    if (response.status === 204) return {};
    return response.json();
  }

  return {
    getUpdates({ marker }) {
      return request('GET', '/updates', {
        query: {
          marker,
          timeout: 30,
          types: 'message_created,message_callback,bot_started'
        }
      });
    },

    sendMessage({ chatId, userId, text, buttons }) {
      const query = chatId ? { chat_id: chatId } : { user_id: userId };
      const attachments = buttons?.length ? [createKeyboardAttachment(buttons)] : undefined;
      return request('POST', '/messages', {
        query,
        body: { text, attachments }
      });
    },

    answerCallback({ callbackId, text }) {
      if (!callbackId) return Promise.resolve({});
      return request('POST', '/answers', {
        query: { callback_id: callbackId },
        body: { notification: text || '' }
      }).catch(() => ({}));
    }
  };
}

async function handleUpdate({ update, client, adminIds, publicBaseUrl }) {
  const message = update.message || update.update?.message;
  const callback = update.callback || update.update?.callback;

  if (callback) {
    await handleCallback({ callback, client, adminIds, publicBaseUrl });
    return;
  }

  if (!message) return;

  const userId = getMessageUserId(message);
  const chatId = getMessageChatId(message);
  const text = getMessageText(message);

  if (!isAdminId(userId, adminIds)) {
    await client.sendMessage({ chatId, userId, text: 'Нет доступа.' });
    return;
  }

  if (text === '/start') {
    await client.sendMessage({
      chatId,
      userId,
      text: 'Готов создавать ссылки для курса. Нажмите /link, чтобы выбрать срок.'
    });
    return;
  }

  if (text === '/link') {
    await sendDurationPicker({ client, chatId, userId });
    return;
  }

  if (text === '/expired') {
    const url = createAccessUrl({ months: -1, publicBaseUrl });
    await client.sendMessage({ chatId, userId, text: `Тестовая истекшая ссылка:\n${url}` });
  }
}

async function handleCallback({ callback, client, adminIds, publicBaseUrl }) {
  const userId = String(callback.user?.user_id || callback.user?.id || '');
  const chatId = callback.message?.recipient?.chat_id || callback.message?.chat_id;
  const payload = String(callback.payload || callback.data || '');

  if (!isAdminId(userId, adminIds)) {
    await client.answerCallback({ callbackId: callback.callback_id, text: 'Нет доступа.' });
    return;
  }

  const match = payload.match(/^link:(\d+)$/);
  if (!match) return;

  const months = Number(match[1]);
  const url = createAccessUrl({ months, publicBaseUrl });

  await client.answerCallback({ callbackId: callback.callback_id, text: 'Ссылка создана' });
  await client.sendMessage({
    chatId,
    userId,
    text: `Ссылка-доступ на ${monthsText(months)}:\n${url}`
  });
}

function sendDurationPicker({ client, chatId, userId }) {
  return client.sendMessage({
    chatId,
    userId,
    text: 'На какой срок выдать доступ ученику?',
    buttons: durations.map((item) => ({
      text: item.label,
      payload: `link:${item.months}`
    }))
  });
}

function createAccessUrl({ months, publicBaseUrl }) {
  const token = createAccessToken({ months, secret: getAccessSecret() });
  const baseUrl = readPublicBaseUrl(publicBaseUrl);
  return `${baseUrl.replace(/\/$/, '')}/?k=${token}`;
}

function createKeyboardAttachment(buttons) {
  return {
    type: 'inline_keyboard',
    payload: {
      buttons: buttons.map((button) => ([{
        type: 'callback',
        text: button.text,
        payload: button.payload
      }]))
    }
  };
}

function getMessageUserId(message) {
  return String(
    message.sender?.user_id
      || message.sender?.id
      || message.from?.user_id
      || message.from?.id
      || ''
  );
}

function getMessageChatId(message) {
  return message.recipient?.chat_id || message.chat_id || message.chat?.id || null;
}

function getMessageText(message) {
  return String(message.body?.text || message.text || '').trim();
}

function isAdminId(userId, adminIds) {
  return adminIds.includes(String(userId));
}

function monthsText(months) {
  if (months === 1) return '1 месяц';
  if (months > 1 && months < 5) return `${months} месяца`;
  return `${months} месяцев`;
}

function readPublicBaseUrl(fallback) {
  try {
    const envPath = path.join(process.cwd(), '.env');
    const raw = readFileSync(envPath, 'utf8');
    const line = raw.split(/\r?\n/).find((item) => item.startsWith('PUBLIC_BASE_URL='));
    const value = line?.slice('PUBLIC_BASE_URL='.length).trim().replace(/^["']|["']$/g, '');
    return value || fallback;
  } catch {
    return fallback;
  }
}

function getAccessSecret() {
  return process.env.ACCESS_TOKEN_SECRET || 'course-feed-access-v1';
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
