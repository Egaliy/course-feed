import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const telegramFileBase = 'https://api.telegram.org/file/bot';

export async function downloadTelegramFile({ botToken, fileId, uploadDir }) {
  const file = await getTelegramFile(botToken, fileId);
  const extension = path.extname(file.file_path) || '.bin';
  const name = `${Date.now()}-${Math.random().toString(16).slice(2)}${extension}`;
  const absolutePath = path.join(uploadDir, name);

  await mkdir(uploadDir, { recursive: true });

  const response = await fetch(`${telegramFileBase}${botToken}/${file.file_path}`);
  if (!response.ok) {
    throw new Error(`Telegram file download failed: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(absolutePath, buffer);

  return {
    url: `/uploads/${name}`,
    size: file.file_size ?? buffer.length
  };
}

async function getTelegramFile(botToken, fileId) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
  const payload = await response.json();

  if (!payload.ok) {
    throw new Error(payload.description || 'Telegram getFile failed');
  }

  return payload.result;
}

export function extractMedia(message) {
  if (message.photo?.length) {
    const photo = message.photo.at(-1);
    return [{ kind: 'photo', fileId: photo.file_id }];
  }

  if (message.video) {
    return [{ kind: 'video', fileId: message.video.file_id }];
  }

  if (message.audio) {
    return [{ kind: 'audio', fileId: message.audio.file_id }];
  }

  if (message.voice) {
    return [{ kind: 'audio', fileId: message.voice.file_id }];
  }

  if (message.document) {
    const mime = message.document.mime_type || '';
    const kind = mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'file';
    return [{ kind, fileId: message.document.file_id, name: message.document.file_name }];
  }

  return [];
}

export function extractText(message) {
  return message.text || message.caption || '';
}
