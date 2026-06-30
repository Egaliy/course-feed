import { Telegraf, Markup } from 'telegraf';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createAccessToken } from './access-token.js';
import { downloadTelegramFile, extractMedia, extractText } from './media.js';

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

  bot.start((ctx) => {
    if (!isAdmin(ctx, adminIds)) return ctx.reply('Нет доступа.');
    return ctx.reply('Готов публиковать посты. Отправьте текст, фото, видео или аудио. Для ссылки ученику используйте /link.');
  });

  bot.command('link', async (ctx) => {
    if (!isAdmin(ctx, adminIds)) return ctx.reply('Нет доступа.');

    return ctx.reply(
      'На какой срок выдать доступ ученику?',
      Markup.inlineKeyboard(durations.map((item) => Markup.button.callback(item.label, `link:${item.months}`)))
    );
  });

  bot.action(/^link:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx, adminIds)) return ctx.answerCbQuery('Нет доступа.');

    const months = Number(ctx.match[1]);
    const token = createAccessToken({ months, secret: getAccessSecret() });
    const baseUrl = readPublicBaseUrl(publicBaseUrl);
    const url = `${baseUrl.replace(/\/$/, '')}/?k=${token}`;

    await ctx.answerCbQuery('Ссылка создана');
    return ctx.reply(`Ссылка-доступ на ${monthsText(months)}:\n${url}`);
  });

  bot.on('message', async (ctx) => {
    if (!isAdmin(ctx, adminIds)) return;
    if (ctx.message.text?.startsWith('/')) return;

    if (ctx.message.media_group_id) {
      bufferAlbum(ctx, albumBuffers, () => publishAlbum({ ctx, botToken, store, uploadDir, albumBuffers, authorCache }));
      return;
    }

    try {
      const author = await getAuthor({ ctx, botToken, uploadDir, authorCache });
      await publishMessage({ message: ctx.message, botToken, store, uploadDir, author });
      await ctx.reply('Опубликовано.');
    } catch (error) {
      console.error(error);
      await ctx.reply('Не получилось опубликовать. Проверьте размер файла и попробуйте еще раз.');
    }
  });

  return bot;
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

async function publishAlbum({ ctx, botToken, store, uploadDir, albumBuffers, authorCache }) {
  const key = ctx.message.media_group_id;
  const album = albumBuffers.get(key);
  if (!album) return;

  albumBuffers.delete(key);

  try {
    const media = [];
    let text = '';
    const author = await getAuthor({ ctx, botToken, uploadDir, authorCache });

    for (const message of album.messages) {
      text ||= extractText(message);
      const items = extractMedia(message);

      for (const item of items) {
        const file = await downloadTelegramFile({ botToken, fileId: item.fileId, uploadDir });
        media.push({ ...item, ...file });
      }
    }

    await store.addPost({ text, media, author });
    await ctx.telegram.sendMessage(album.chatId, 'Альбом опубликован.');
  } catch (error) {
    console.error(error);
    await ctx.telegram.sendMessage(album.chatId, 'Не получилось опубликовать альбом. Проверьте размер файлов.');
  }
}

async function publishMessage({ message, botToken, store, uploadDir, author }) {
  const media = [];

  for (const item of extractMedia(message)) {
    const file = await downloadTelegramFile({ botToken, fileId: item.fileId, uploadDir });
    media.push({ ...item, ...file });
  }

  await store.addPost({
    text: extractText(message),
    media,
    author
  });
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
