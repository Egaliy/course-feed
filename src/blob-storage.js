import crypto from 'node:crypto';
import path from 'node:path';
import { get, put } from '@vercel/blob';

const dbPathname = 'data/db.json';
const telegramFileBase = 'https://api.telegram.org/file/bot';

export const defaultState = {
  posts: [],
  accessLinks: [],
  registrations: [],
  students: [],
  adminCodes: []
};

export function hasBlobStorage() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN));
}

export async function readBlobState() {
  if (!hasBlobStorage()) return structuredClone(defaultState);

  try {
    const result = await get(dbPathname, { access: 'public' });
    if (!result?.stream) return structuredClone(defaultState);

    const raw = await streamToString(result.stream);
    return normalizeState(JSON.parse(raw));
  } catch (error) {
    if (isMissingBlobError(error)) return structuredClone(defaultState);
    throw error;
  }
}

export async function writeBlobState(state) {
  if (!hasBlobStorage()) {
    throw new Error('BLOB_READ_WRITE_TOKEN is missing');
  }

  await put(dbPathname, JSON.stringify(normalizeState(state), null, 2), {
    access: 'public',
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 60
  });
}

export async function addBlobPost(input) {
  const state = await readBlobState();
  const post = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    text: '',
    media: [],
    ...input
  };

  state.posts.push(post);
  await writeBlobState(state);
  return post;
}

export async function createBlobAccessLink(months) {
  const state = await readBlobState();
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setMonth(expiresAt.getMonth() + months);

  let token = '';
  const existingTokens = new Set((state.accessLinks || []).map((link) => link.token));

  do {
    token = crypto.randomBytes(7).toString('base64url');
  } while (existingTokens.has(token));

  const link = {
    token,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    months
  };

  state.accessLinks.push(link);
  await writeBlobState(state);
  return link;
}

export async function uploadTelegramFileToBlob({ botToken, fileId, name }) {
  if (!hasBlobStorage()) {
    throw new Error('BLOB_READ_WRITE_TOKEN is missing');
  }

  const file = await getTelegramFile(botToken, fileId);
  const extension = path.extname(name || file.file_path || '') || '.bin';
  const pathname = `uploads/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}${extension}`;
  const response = await fetch(`${telegramFileBase}${botToken}/${file.file_path}`);

  if (!response.ok) {
    throw new Error(`Telegram file download failed: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const blob = await put(pathname, buffer, {
    access: 'public',
    contentType,
    addRandomSuffix: false,
    cacheControlMaxAge: 31536000
  });

  return {
    url: blob.url,
    size: file.file_size ?? buffer.length
  };
}

function normalizeState(state) {
  return {
    ...structuredClone(defaultState),
    ...(state || {}),
    posts: Array.isArray(state?.posts) ? state.posts : [],
    accessLinks: Array.isArray(state?.accessLinks) ? state.accessLinks : [],
    registrations: Array.isArray(state?.registrations) ? state.registrations : [],
    students: Array.isArray(state?.students) ? state.students : [],
    adminCodes: Array.isArray(state?.adminCodes) ? state.adminCodes : []
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

async function streamToString(stream) {
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
}

function isMissingBlobError(error) {
  const message = String(error?.message || '');
  return message.includes('404') || message.includes('not found') || message.includes('NoSuchKey');
}
