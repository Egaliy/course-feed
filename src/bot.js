import { Telegraf, Markup } from 'telegraf';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createCompactAccessToken } from './access-token.js';
import { downloadTelegramFile, extractMedia, extractText } from './media.js';
import { normalizeTopics, getTopicById } from './topics.js';

const durations = [
  { label: '1 месяц', months: 1 },
  { label: '3 месяца', months: 3 },
  { label: '6 месяцев', months: 6 },
  { label: '9 месяцев', months: 9 }
];

export function createBot({ botToken, adminIds, publicBaseUrl, store, uploadDir }) {
  const bot = new Telegraf(botToken);
  const albumBuffers = new Map();
  const authorCache = new Map();
  const pendingCache = new Map();

  bot.start(async (ctx) => {
    await deleteCommandMessage(ctx);
    if (!isAdmin(ctx, adminIds)) return replyTemporary(ctx, 'Нет доступа.');
    return replyTemporary(ctx, 'Готов публиковать посты. Отправьте текст, фото, видео или файл. Для ссылки ученику используйте /link.', undefined, 18000);
  });

  bot.command('help', async (ctx) => {
    await deleteCommandMessage(ctx);
    if (!isAdmin(ctx, adminIds)) return replyTemporary(ctx, 'Нет доступа.');
    return ctx.reply([
      'Команды бота:',
      '',
      '/link - создать ссылку доступа на 1, 3, 6 или 9 месяцев',
      '/manage - открыть управление материалами на сайте',
      '/topic_add Название - добавить новый раздел',
      '/subtopic_add Раздел | Подраздел - добавить подраздел',
      '/help - показать эту подсказку',
      '',
      'Чтобы опубликовать материал, отправьте текст, фото, видео, голосовое или файл. Бот спросит, в какой раздел его добавить.'
    ].join('\n'));
  });

  bot.command('manage', async (ctx) => {
    await deleteCommandMessage(ctx);
    if (!isAdmin(ctx, adminIds)) return replyTemporary(ctx, 'Нет доступа.');
    const key = process.env.SITE_ADMIN_KEY || process.env.TELEGRAM_WEBHOOK_SECRET || '';
    if (!key) return ctx.reply('Ключ управления сайтом не настроен.');
    const baseUrl = readPublicBaseUrl(publicBaseUrl).replace(/\/$/, '');
    return ctx.reply(`Управление материалами на сайте:\n${baseUrl}/?manage=${encodeURIComponent(key)}`);
  });

  bot.command('link', async (ctx) => {
    await deleteCommandMessage(ctx);
    if (!isAdmin(ctx, adminIds)) return replyTemporary(ctx, 'Нет доступа.');

    return ctx.reply(
      'На какой срок выдать доступ ученику?',
      Markup.inlineKeyboard(durations.map((item) => [Markup.button.callback(item.label, `link:${item.months}`)]))
    );
  });

  bot.command('topic', async (ctx) => {
    await deleteCommandMessage(ctx);
    if (!isAdmin(ctx, adminIds)) return replyTemporary(ctx, 'Нет доступа.');
    const topics = normalizeTopics(store.getTopics());
    const active = getTopicById(topics, store.getAdminTopicSelection(ctx.from?.id));
    return ctx.reply(
      `Выберите раздел для следующих публикаций.\nСейчас: ${active.label}`,
      Markup.inlineKeyboard(topics.map((t) => [Markup.button.callback(t.id === active.id ? `✓ ${t.label}` : t.label, `topic:${t.id}`)]))
    );
  });

  bot.hears(/^\/topic_add\s+(.+)$/, async (ctx) => {
    await deleteCommandMessage(ctx);
    if (!isAdmin(ctx, adminIds)) return replyTemporary(ctx, 'Нет доступа.');
    const label = ctx.match[1].trim();
    const topic = await store.addTopic(label);
    return ctx.reply(`Раздел добавлен: ${topic.label}`);
  });

  bot.hears(/^\/subtopic_add\s+(.+)$/, async (ctx) => {
    await deleteCommandMessage(ctx);
    if (!isAdmin(ctx, adminIds)) return replyTemporary(ctx, 'Нет доступа.');
    const [parentText, labelText] = ctx.match[1].split('|').map(s => s.trim());
    if (!parentText || !labelText) return ctx.reply('Напишите так: /subtopic_add Раздел | Название подраздела');
    const topics = normalizeTopics(store.getTopics());
    const parent = findTopicByText(topics, parentText);
    if (!parent) return ctx.reply(`Раздел не найден: ${parentText}`);
    const topic = await store.addTopic(labelText, { parentId: parent.id });
    return ctx.reply(`Подраздел добавлен: ${parent.label} → ${topic.label}`);
  });

  bot.action(/^link:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx, adminIds)) return ctx.answerCbQuery('Нет доступа.');

    const months = Number(ctx.match[1]);
    const token = createCompactAccessToken({ months, secret: getAccessSecret() });
    const baseUrl = readPublicBaseUrl(publicBaseUrl);
    const url = `${baseUrl.replace(/\/$/, '')}/a/${token}`;

    await ctx.answerCbQuery('Ссылка создана');
    await ctx.deleteMessage().catch(() => {});
    return ctx.reply(`Ссылка-доступ на ${monthsText(months)}:\n${url}`);
  });

  bot.action(/^topic:([A-Za-z0-9_-]+)$/, async (ctx) => {
    if (!isAdmin(ctx, adminIds)) return ctx.answerCbQuery('Нет доступа.');
    const topicId = ctx.match[1];
    await store.setAdminTopicSelection(ctx.from?.id, topicId);
    const topics = normalizeTopics(store.getTopics());
    const topic = getTopicById(topics, topicId);
    await ctx.answerCbQuery(`Раздел: ${topic.label}`);
    await ctx.deleteMessage().catch(() => {});
    return ctx.reply(`Активный раздел для новых публикаций: ${topic.label}`);
  });

  bot.action(/^del:([A-Za-z0-9_-]+)$/, async (ctx) => {
    if (!isAdmin(ctx, adminIds)) return ctx.answerCbQuery('Нет доступа.');
    const postId = ctx.match[1];
    const deleted = await store.deletePost(postId);
    if (deleted) {
      await ctx.answerCbQuery('Удалено');
      await ctx.reply('Материал удален.');
      await ctx.deleteMessage().catch(() => {});
    } else {
      await ctx.answerCbQuery('Не найдено или уже удалено');
    }
  });

  bot.action(/^pub:([A-Za-z0-9_-]+):([A-Za-z0-9_-]+)$/, async (ctx) => {
    if (!isAdmin(ctx, adminIds)) return ctx.answerCbQuery('Нет доступа.');
    const pendingId = ctx.match[1];
    const topicId = ctx.match[2];
    const pending = pendingCache.get(pendingId);

    if (!pending) {
      await ctx.answerCbQuery('Материал не найден. Отправьте его еще раз.');
      await ctx.deleteMessage().catch(() => {});
      return;
    }

    if (String(pending.adminId) !== String(ctx.from?.id)) {
      await ctx.answerCbQuery('Это выбор для другого администратора.');
      return;
    }

    const topics = normalizeTopics(store.getTopics());
    const topic = topics.find((item) => item.id === topicId);
    if (!topic) {
      await ctx.answerCbQuery('Раздел не найден.');
      return;
    }

    await ctx.answerCbQuery('Публикую...');

    try {
      pendingCache.delete(pendingId);
      const author = await getAuthor({ ctx, botToken, uploadDir, authorCache });
      const post = await finishPublishingPending({ pending, botToken, store, uploadDir, topicId, author });
      await ctx.deleteMessage().catch(() => {});
      await ctx.reply(`Опубликовано.\nРаздел: ${topic.label}\nМатериал: ${describePost(post)}`, Markup.inlineKeyboard([
        [Markup.button.callback('Удалить', `del:${post.id}`)]
      ]));
    } catch (error) {
      console.error(error);
      await ctx.reply('Не получилось опубликовать. Проверьте размер файлов.');
    }
  });

  bot.on('message', async (ctx) => {
    if (!isAdmin(ctx, adminIds)) return;
    const textOrCaption = ctx.message.text || ctx.message.caption || '';
    if (textOrCaption.trim().startsWith('/')) return;

    if (ctx.message.media_group_id) {
      bufferAlbum(ctx, albumBuffers, () => askAlbumTopic({ ctx, store, albumBuffers, pendingCache }));
      return;
    }

    const text = extractText(ctx.message);
    const media = extractMedia(ctx.message);
    if (!text && !media.length) return;

    const pendingId = crypto.randomBytes(8).toString('base64url');
    pendingCache.set(pendingId, {
      id: pendingId,
      adminId: String(ctx.from?.id || ''),
      message: ctx.message,
      text,
      media,
      isAlbum: false
    });

    await askPublicationTopic(ctx, store, pendingId, text, media);
  });

  return bot;
}

async function askAlbumTopic({ ctx, store, albumBuffers, pendingCache }) {
  const key = ctx.message.media_group_id;
  const album = albumBuffers.get(key);
  if (!album) return;

  albumBuffers.delete(key);

  let text = '';
  const allMedia = [];
  for (const message of album.messages) {
    text ||= extractText(message);
    allMedia.push(...extractMedia(message));
  }

  const pendingId = crypto.randomBytes(8).toString('base64url');
  pendingCache.set(pendingId, {
    id: pendingId,
    adminId: String(album.messages[0].from?.id || ''),
    messages: album.messages,
    text,
    media: allMedia,
    isAlbum: true
  });

  const topics = normalizeTopics(store.getTopics());
  await ctx.telegram.sendMessage(album.chatId, `Куда опубликовать: ${describeDraft({ text, media: allMedia })}?`, {
    reply_markup: {
      inline_keyboard: chunkButtons(topics.map((topic) => ({
        text: topic.parentId ? `↳ ${topic.label}` : topic.label,
        callback_data: `pub:${pendingId}:${topic.id}`
      })), 1)
    }
  });
}

async function askPublicationTopic(ctx, store, pendingId, text, media) {
  const topics = normalizeTopics(store.getTopics());
  await ctx.reply(`Куда опубликовать: ${describeDraft({ text, media })}?`, {
    reply_markup: {
      inline_keyboard: chunkButtons(topics.map((topic) => ({
        text: topic.parentId ? `↳ ${topic.label}` : topic.label,
        callback_data: `pub:${pendingId}:${topic.id}`
      })), 1)
    }
  });
}

async function finishPublishingPending({ pending, botToken, store, uploadDir, topicId, author }) {
  const finalMedia = [];

  if (pending.isAlbum) {
    for (const message of pending.messages) {
      const items = extractMedia(message);
      for (const item of items) {
        const file = await downloadTelegramFile({ botToken, fileId: item.fileId, uploadDir });
        finalMedia.push({ ...item, ...file });
      }
    }
  } else {
    for (const item of pending.media) {
      const file = await downloadTelegramFile({ botToken, fileId: item.fileId, uploadDir });
      finalMedia.push({ ...item, ...file });
    }
  }

  return store.addPost({
    text: pending.text,
    media: finalMedia,
    author,
    topicId
  });
}

async function replyTemporary(ctx, text, extra, ttl = 8000) {
  const message = await ctx.reply(text, extra);
  deleteMessageLater(ctx, message, ttl);
  return message;
}

function deleteMessageLater(ctx, message, ttl) {
  const chatId = message.chat?.id;
  const messageId = message.message_id;
  if (!chatId || !messageId) return;

  setTimeout(() => {
    ctx.telegram.deleteMessage(chatId, messageId).catch(() => {});
  }, ttl);
}

function deleteCommandMessage(ctx) {
  return ctx.deleteMessage().catch(() => {});
}

function isAdmin(ctx, adminIds) {
  return adminIds.includes(String(ctx.from?.id));
}

function bufferAlbum(ctx, albumBuffers, publish) {
  const key = ctx.message.media_group_id;
  const existing = albumBuffers.get(key) || { messages: [], timer: null, chatId: ctx.chat.id };

  existing.messages.push(ctx.message);
  clearTimeout(existing.timer);
  existing.timer = setTimeout(publish, 1400);
  albumBuffers.set(key, existing);
}

async function getAuthor({ ctx, botToken, uploadDir, authorCache }) {
  const from = ctx.from || {};
  const id = String(from.id || 'admin');

  if (authorCache.has(id)) {
    return authorCache.get(id);
  }

  const name = [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || 'Автор курса';
  const author = {
    id,
    name,
    username: from.username || '',
    avatarUrl: ''
  };

  try {
    const photos = await ctx.telegram.getUserProfilePhotos(from.id, 0, 1);
    const sizes = photos.photos?.[0];

    if (sizes?.length) {
      const photo = sizes.at(-1);
      const file = await downloadTelegramFile({ botToken, fileId: photo.file_id, uploadDir });
      author.avatarUrl = file.url;
    }
  } catch (error) {
    console.warn('Could not load author avatar:', error.message);
  }

  authorCache.set(id, author);
  return author;
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

function describePost(post) {
  const text = String(post.text || '').trim().replace(/\s+/g, ' ');
  if (text) return text.length > 34 ? `${text.slice(0, 34)}...` : text;

  const media = Array.isArray(post.media) ? post.media : [];
  if (!media.length) return 'публикация';

  const labels = { photo: 'фото', audio: 'голосовое', video: 'видео', file: 'файл' };
  const first = labels[media[0]?.kind] || 'файл';
  return media.length > 1 ? `${first} +${media.length - 1}` : first;
}

function describeDraft({ text, media }) {
  const value = String(text || '').trim().replace(/\s+/g, ' ');
  if (value) return value.length > 34 ? `${value.slice(0, 34)}...` : value;

  const labels = { photo: 'фото', audio: 'голосовое', video: 'видео', file: 'файл' };
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

function findTopicByText(topics, value) {
  const needle = String(value || '').trim().toLowerCase();
  return topics.find((topic) => (
    String(topic.id).toLowerCase() === needle
      || String(topic.label).toLowerCase() === needle
      || String(topic.shortLabel || '').toLowerCase() === needle
  ));
}
