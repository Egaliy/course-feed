import { createCompactAccessToken } from '../src/access-token.js';
import {
  addBlobPost,
  addBlobTopic,
  addPendingPublication,
  deleteBlobPost,
  deletePendingPublication,
  getAdminTopicSelection,
  getBlobTopics,
  getPendingPublication,
  hasBlobStorage,
  readBlobState,
  setAdminTopicSelection,
  setAdminRenameState,
  getAdminRenameState,
  uploadTelegramFileToBlob
} from '../src/blob-storage.js';
import { extractMedia, extractText } from '../src/media.js';

const durations = [
  { label: '3 дня', code: 'd3', days: 3 },
  { label: '7 дней', code: 'd7', days: 7 },
  { label: '1 месяц', code: 'm1', months: 1 },
  { label: '3 месяца', code: 'm3', months: 3 },
  { label: '6 месяцев', code: 'm6', months: 6 },
  { label: '9 месяцев', code: 'm9', months: 9 }
];

let botMenuCommandsConfigured = false;

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
    await ensureBotMenuCommands(botToken);
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
    await sendHelpMessage({ botToken, chatId });
    return;
  }

  if (text === '/help') {
    await deleteMessage({ botToken, chatId, messageId: message.message_id });
    await sendHelpMessage({ botToken, chatId });
    return;
  }

  if (text === '/link') {
    await deleteMessage({ botToken, chatId, messageId: message.message_id });
    await sendMessage({
      botToken,
      chatId,
      text: 'На какой срок выдать доступ ученику?',
      replyMarkup: {
        inline_keyboard: durations.map((item) => [{
          text: item.label,
          callback_data: `link:${item.code}`
        }])
      }
    });
    return;
  }

  if (text === '/manage') {
    await deleteMessage({ botToken, chatId, messageId: message.message_id });
    await sendManageLink({ botToken, chatId });
    return;
  }

  if (text === '/delete') {
    await deleteMessage({ botToken, chatId, messageId: message.message_id });
    await sendDeletePicker({ botToken, chatId });
    return;
  }

  if (text === '/topic') {
    await deleteMessage({ botToken, chatId, messageId: message.message_id });
    await sendTopicPicker({ botToken, chatId, userId });
    return;
  }

  if (text.startsWith('/topic_add')) {
    await deleteMessage({ botToken, chatId, messageId: message.message_id });
    const label = text.replace('/topic_add', '').trim();
    await createTopicFromCommand({ botToken, chatId, label });
    return;
  }

  if (text.startsWith('/subtopic_add')) {
    await deleteMessage({ botToken, chatId, messageId: message.message_id });
    const input = text.replace('/subtopic_add', '').trim();
    await createSubtopicFromCommand({ botToken, chatId, input });
    return;
  }

  if (text.startsWith('/')) return;

  if (message.reply_to_message && message.reply_to_message.text && message.reply_to_message.text.includes('(ID: ')) {
    const match = message.reply_to_message.text.match(/\(ID:\s*([A-Za-z0-9_-]+)\)/);
    if (match) {
      const pendingId = match[1];
      const pending = await getPendingPublication(pendingId);
      if (pending) {
        pending.media.forEach(m => m.name = text.trim());
        await addPendingPublication(pending); // overwrite
        const topics = await getBlobTopics();
        
        const keyboard = chunkButtons(topics.map((topic) => ({
          text: topic.parentId ? `↳ ${topic.label}` : topic.label,
          callback_data: `pub:${pending.id}:${topic.id}`
        })), 1);
        keyboard.push([{ text: '📝 Переименовать файлы', callback_data: `ren:${pending.id}` }]);

        await sendMessage({
          botToken,
          chatId,
          text: `Имена файлов обновлены! Куда опубликовать: ${describeDraft({ text: pending.text, media: pending.media })}?`,
          replyMarkup: { inline_keyboard: keyboard }
        });
        return;
      }
    }
  }

  if (text && !text.startsWith('/')) {
    const pendingIdToRename = await getAdminRenameState(userId);
    if (pendingIdToRename) {
      const pending = await getPendingPublication(pendingIdToRename);
      await setAdminRenameState(userId, null); // clear state immediately
      
      if (pending) {
        pending.media.forEach(m => m.name = text.trim());
        await addPendingPublication(pending); // overwrite
        const topics = await getBlobTopics();
        
        const keyboard = chunkButtons(topics.map((topic) => ({
          text: topic.parentId ? `↳ ${topic.label}` : topic.label,
          callback_data: `pub:${pending.id}:${topic.id}`
        })), 1);
        keyboard.push([{ text: '📝 Переименовать файлы', callback_data: `ren:${pending.id}` }]);

        await sendMessage({
          botToken,
          chatId,
          text: `Имена файлов обновлены! Куда опубликовать: ${describeDraft({ text: pending.text, media: pending.media })}?`,
          replyMarkup: { inline_keyboard: keyboard }
        });
        return;
      }
    }
  }

  await askPublicationTopic({ message, botToken, chatId, userId });
}

async function askPublicationTopic({ message, botToken, chatId, userId }) {
  if (!hasBlobStorage()) {
    await sendMessage({
      botToken,
      chatId,
      text: 'Хранилище Vercel Blob еще не подключено. Добавьте BLOB_READ_WRITE_TOKEN в переменные Vercel.'
    });
    return;
  }

  const text = extractText(message);
  const media = extractMedia(message);
  if (!text && !media.length) return;

  const [pending, topics] = await Promise.all([
    addPendingPublication({
      adminId: userId,
      chatId,
      text,
      media
    }),
    getBlobTopics()
  ]);

  const keyboard = buildTopicKeyboard(topics, (topic) => `pub:${pending.id}:${topic.id}`);

  if (pending.media && pending.media.length > 0) {
    keyboard.push([{ text: '📝 Переименовать файлы', callback_data: `ren:${pending.id}` }]);
  }

  await sendMessage({
    botToken,
    chatId,
    text: `Куда опубликовать: ${describeDraft({ text, media })}?`,
    replyMarkup: {
      inline_keyboard: keyboard
    }
  });
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

  const deleteMatch = payload.match(/^del:([A-Za-z0-9_-]+)$/);
  if (deleteMatch) {
    await deletePostFromCallback({
      botToken,
      chatId,
      callbackId: callback.id,
      messageId: callback.message.message_id,
      postId: deleteMatch[1]
    });
    return;
  }

  const publishMatch = payload.match(/^pub:([A-Za-z0-9_-]+):([A-Za-z0-9_-]+)$/);
  if (publishMatch) {
    await publishPendingMessage({
      botToken,
      chatId,
      userId,
      callbackId: callback.id,
      messageId: callback.message.message_id,
      pendingId: publishMatch[1],
      topicId: publishMatch[2]
    });
    return;
  }

  const topicMatch = payload.match(/^topic:([A-Za-z0-9_-]+)$/);
  if (topicMatch) {
    const topic = await setAdminTopicSelection(userId, topicMatch[1]);
    await answerCallback({ botToken, callbackId: callback.id, text: `Раздел: ${topic.label}` });
    await deleteMessage({ botToken, chatId, messageId: callback.message.message_id });
    await sendMessage({ botToken, chatId, text: `Активный раздел для новых публикаций: ${topic.label}` });
    return;
  }

  const renMatch = payload.match(/^ren:([A-Za-z0-9_-]+)$/);
  if (renMatch) {
    const pendingId = renMatch[1];
    await setAdminRenameState(userId, pendingId);
    
    await answerCallback({ botToken, callbackId: callback.id });
    await deleteMessage({ botToken, chatId, messageId: callback.message.message_id });
    await sendMessage({
      botToken,
      chatId,
      text: `Отправьте мне новое имя прикрепленных файлов (просто напишите следующим сообщением).`
    });
    return;
  }

  const match = payload.match(/^link:([A-Za-z0-9]+)$/);
  if (!match) return;

  const duration = getDurationByCode(match[1]);
  if (!duration) {
    await answerCallback({ botToken, callbackId: callback.id, text: 'Неизвестный срок' });
    return;
  }

  const url = await createAccessUrl(duration);

  await answerCallback({ botToken, callbackId: callback.id, text: `${durationText(duration)}: ссылка создана` });
  await deleteMessage({ botToken, chatId, messageId: callback.message.message_id });
  await sendMessage({
    botToken,
    chatId,
    text: `Ссылка-доступ на ${durationText(duration)}:\n${url}`
  });
}

async function createAccessUrl(duration) {
  const baseUrl = (process.env.PUBLIC_BASE_URL || 'https://course-feed.vercel.app').replace(/\/$/, '');

  const token = createCompactAccessToken({ ...duration, secret: getAccessSecret() });
  return `${baseUrl}/a/${token}`;
}

async function sendHelpMessage({ botToken, chatId }) {
  await sendMessage({
    botToken,
    chatId,
    text: [
      'Команды бота:',
      '',
      '/link - создать ссылку доступа на 3 дня, 7 дней, 1, 3, 6 или 9 месяцев',
      '/manage - открыть управление материалами на сайте',
      '/delete - удалить материалы через бота',
      '/topic_add Название - добавить новый раздел',
      '/subtopic_add Раздел | Подраздел - добавить подраздел',
      '/help - показать эту подсказку',
      '',
      'Чтобы опубликовать материал, отправьте текст, фото, видео, голосовое или файл. Бот спросит, в какой раздел его добавить.'
    ].join('\n')
  });
}

async function ensureBotMenuCommands(botToken) {
  if (botMenuCommandsConfigured) return;

  try {
    await telegramRequest({
      botToken,
      method: 'setMyCommands',
      body: {
        commands: [
          { command: 'start', description: 'показать меню' },
          { command: 'link', description: 'создать ссылку доступа' },
          { command: 'manage', description: 'управление материалами' },
          { command: 'delete', description: 'удалить материалы' },
          { command: 'topic_add', description: 'добавить раздел' },
          { command: 'subtopic_add', description: 'добавить подраздел' },
          { command: 'help', description: 'подсказка по командам' }
        ]
      }
    });
    botMenuCommandsConfigured = true;
  } catch (error) {
    console.error('Telegram command menu failed:', error);
  }
}

async function sendTopicPicker({ botToken, chatId, userId }) {
  if (!hasBlobStorage()) {
    await sendMessage({ botToken, chatId, text: 'Хранилище Vercel Blob еще не подключено.' });
    return;
  }

  const [topics, active] = await Promise.all([
    getBlobTopics(),
    getAdminTopicSelection(userId)
  ]);

  await sendMessage({
    botToken,
    chatId,
    text: `Выберите раздел для следующих публикаций.\nСейчас: ${active.label}`,
    replyMarkup: {
      inline_keyboard: buildTopicKeyboard(topics, (topic) => `topic:${topic.id}`, active.id)
    }
  });
}

async function sendDeletePicker({ botToken, chatId }) {
  if (!hasBlobStorage()) {
    await sendMessage({ botToken, chatId, text: 'Хранилище Vercel Blob еще не подключено.' });
    return;
  }

  const [state, topics] = await Promise.all([
    readBlobState(),
    getBlobTopics()
  ]);
  const posts = [...(state.posts || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (!posts.length) {
    await sendMessage({ botToken, chatId, text: 'Материалов для удаления пока нет.' });
    return;
  }

  const groups = groupPostsByTopic(posts, topics);
  for (const group of groups) {
    await sendMessage({
      botToken,
      chatId,
      text: `Удаление материалов\nРаздел: ${group.label}`,
      replyMarkup: {
        inline_keyboard: group.posts.map((post) => [{
          text: `🗑 ${describePost(post)} · ${formatTelegramTime(post.createdAt)}`,
          callback_data: `del:${post.id}`
        }])
      }
    });
  }
}

async function createTopicFromCommand({ botToken, chatId, label }) {
  if (!label) {
    await sendMessage({ botToken, chatId, text: 'Напишите так: /topic_add Название раздела' });
    return;
  }

  if (!hasBlobStorage()) {
    await sendMessage({ botToken, chatId, text: 'Хранилище Vercel Blob еще не подключено.' });
    return;
  }

  const topic = await addBlobTopic(label);
  await sendMessage({
    botToken,
    chatId,
    text: `Раздел добавлен: ${topic.label}`
  });
}

async function createSubtopicFromCommand({ botToken, chatId, input }) {
  const [parentText, labelText] = String(input || '').split('|').map((part) => part.trim());

  if (!parentText || !labelText) {
    await sendMessage({ botToken, chatId, text: 'Напишите так: /subtopic_add Раздел | Название подраздела' });
    return;
  }

  if (!hasBlobStorage()) {
    await sendMessage({ botToken, chatId, text: 'Хранилище Vercel Blob еще не подключено.' });
    return;
  }

  const topics = await getBlobTopics();
  const parent = findTopicByText(topics, parentText);
  if (!parent) {
    await sendMessage({ botToken, chatId, text: `Раздел не найден: ${parentText}` });
    return;
  }

  const topic = await addBlobTopic(labelText, { parentId: parent.id });
  await sendMessage({
    botToken,
    chatId,
    text: `Подраздел добавлен: ${parent.label} → ${topic.label}`
  });
}

async function publishPendingMessage({ botToken, chatId, userId, callbackId, messageId, pendingId, topicId }) {
  const [pending, topics] = await Promise.all([
    getPendingPublication(pendingId),
    getBlobTopics()
  ]);

  if (!pending) {
    await answerCallback({ botToken, callbackId, text: 'Материал не найден. Отправьте его еще раз.' });
    await deleteMessage({ botToken, chatId, messageId });
    return;
  }

  if (String(pending.adminId) !== String(userId)) {
    await answerCallback({ botToken, callbackId, text: 'Это выбор для другого администратора.' });
    return;
  }

  const topic = topics.find((item) => item.id === topicId);
  if (!topic) {
    await answerCallback({ botToken, callbackId, text: 'Раздел не найден.' });
    return;
  }

  await answerCallback({ botToken, callbackId, text: 'Публикую...' });

  const media = await Promise.all((pending.media || []).map(async (item) => {
    const file = await uploadTelegramFileToBlob({
      botToken,
      fileId: item.fileId,
      name: item.name
    });
    return { ...item, ...file };
  }));

  const post = await addBlobPost({
    text: pending.text || '',
    media,
    topicId: topic.id
  });
  await deletePendingPublication(pendingId);
  await deleteMessage({ botToken, chatId, messageId });
  await sendMessage({
    botToken,
    chatId,
    text: `Опубликовано.\nРаздел: ${topic.label}\nМатериал: ${describePost(post)}`,
    replyMarkup: {
      inline_keyboard: [[{ text: 'Удалить', callback_data: `del:${post.id}` }]]
    }
  });
}

async function deletePostFromCallback({ botToken, chatId, callbackId, messageId, postId }) {
  const state = await readBlobState();
  const post = (state.posts || []).find((item) => item.id === postId);
  const deleted = await deleteBlobPost(postId);

  await answerCallback({
    botToken,
    callbackId,
    text: deleted ? 'Материал удален.' : 'Материал уже не найден.'
  });

  await deleteMessage({ botToken, chatId, messageId });
  await sendMessage({
    botToken,
    chatId,
    text: deleted ? `Удалено: ${describePost(post || {})}` : 'Материал уже не найден.'
  });
}

function findTopicByText(topics, value) {
  const needle = normalizeText(value);
  return topics.find((topic) => (
    normalizeText(topic.id) === needle
      || normalizeText(topic.label) === needle
      || normalizeText(topic.shortLabel) === needle
  ));
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function buildTopicKeyboard(topics, callbackFactory, activeId = '') {
  const parents = topics.filter((topic) => !topic.parentId);
  const rows = [];

  for (const parent of parents) {
    rows.push([{
      text: `${parent.id === activeId ? '✓ ' : ''}${parent.label}`,
      callback_data: callbackFactory(parent)
    }]);

    topics
      .filter((topic) => topic.parentId === parent.id)
      .forEach((child) => {
        rows.push([{
          text: `↳ ${child.id === activeId ? '✓ ' : ''}${child.label}`,
          callback_data: callbackFactory(child)
        }]);
      });
  }

  return rows;
}

function groupPostsByTopic(posts, topics) {
  const topicMap = new Map(topics.map((topic) => [topic.id, topic]));
  const groups = new Map();

  for (const post of posts) {
    const topic = topicMap.get(String(post.topicId || '')) || topicMap.get('other') || { id: 'other', label: 'Прочее' };
    const parent = topic.parentId ? topicMap.get(topic.parentId) : null;
    const label = parent ? `${parent.label} → ${topic.label}` : topic.label;
    const key = topic.id;

    if (!groups.has(key)) {
      groups.set(key, { label, posts: [] });
    }

    groups.get(key).posts.push(post);
  }

  return [...groups.values()];
}

function formatTelegramTime(value) {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: process.env.COURSE_TIME_ZONE || 'Asia/Novosibirsk',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
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

async function sendManageLink({ botToken, chatId }) {
  const key = getSiteAdminKey();
  if (!key) {
    await sendMessage({ botToken, chatId, text: 'Ключ управления сайтом не настроен.' });
    return;
  }

  const baseUrl = (process.env.PUBLIC_BASE_URL || 'https://course-feed.vercel.app').replace(/\/$/, '');
  await sendMessage({
    botToken,
    chatId,
    text: `Управление материалами на сайте:\n${baseUrl}/?manage=${encodeURIComponent(key)}`
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

function getSiteAdminKey() {
  return process.env.SITE_ADMIN_KEY || process.env.TELEGRAM_WEBHOOK_SECRET || '';
}

function getDurationByCode(code) {
  const value = String(code || '');
  const legacyMonths = Number(value);
  return durations.find((item) => item.code === value)
    || durations.find((item) => item.months === legacyMonths)
    || null;
}

function durationText(duration) {
  if (duration.days) {
    if (duration.days === 1) return '1 день';
    if (duration.days > 1 && duration.days < 5) return `${duration.days} дня`;
    return `${duration.days} дней`;
  }

  return monthsText(duration.months);
}

function monthsText(months) {
  if (months === 1) return '1 месяц';
  if (months > 1 && months < 5) return `${months} месяца`;
  return `${months} месяцев`;
}

function describePost(post) {
  const text = String(post.text || '').trim().replace(/\s+/g, ' ');
  if (text) return text.length > 34 ? `${text.slice(0, 34)}...` : text;

  const media = Array.isArray(post.media) ? post.media : [];
  if (!media.length) return 'публикация';

  const labels = {
    photo: 'фото',
    audio: 'голосовое',
    video: 'видео',
    file: 'файл'
  };
  const first = labels[media[0]?.kind] || 'файл';
  return media.length > 1 ? `${first} +${media.length - 1}` : first;
}

function describeDraft({ text, media }) {
  const value = String(text || '').trim().replace(/\s+/g, ' ');
  if (value) return value.length > 34 ? `${value.slice(0, 34)}...` : value;

  const labels = {
    photo: 'фото',
    audio: 'голосовое',
    video: 'видео',
    file: 'файл'
  };
  const first = labels[media?.[0]?.kind] || 'материал';
  return media.length > 1 ? `${first} +${media.length - 1}` : first;
}

function chunkButtons(items, size) {
  const rows = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}
