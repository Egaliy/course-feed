import crypto from 'node:crypto';
import path from 'node:path';
import { del, get, list, put } from '@vercel/blob';
import { getTopicById, normalizeTopicId, normalizeTopics, slugifyTopic } from './topics.js';

const dbPathname = 'data/db.json';
const statePrefix = 'data/state/';
const pendingPrefix = 'pending-publications';
const telegramFileBase = 'https://api.telegram.org/file/bot';

export const defaultState = {
  posts: [],
  accessLinks: [],
  registrations: [],
  students: [],
  adminCodes: [],
  topics: [],
  adminTopicSelections: {},
  pendingPublications: []
};

export function hasBlobStorage() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN));
}

export async function readBlobState() {
  if (!hasBlobStorage()) return structuredClone(defaultState);

  try {
    const latestPathname = await getLatestStatePathname();
    const state = latestPathname ? await readBlobJson(latestPathname) : await readBlobJson(dbPathname);
    return normalizeState(state);
  } catch (error) {
    if (isMissingBlobError(error)) return structuredClone(defaultState);
    throw error;
  }
}

export async function writeBlobState(state) {
  if (!hasBlobStorage()) {
    throw new Error('BLOB_READ_WRITE_TOKEN is missing');
  }

  const body = JSON.stringify(normalizeState(state), null, 2);
  const versionedPathname = `${statePrefix}${Date.now()}-${crypto.randomBytes(4).toString('hex')}.json`;
  const options = withBlobToken({
    access: 'public',
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 60
  });

  await Promise.all([
    put(versionedPathname, body, options),
    put(dbPathname, body, options)
  ]);
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

export async function getBlobTopics() {
  const state = await readBlobState();
  return normalizeTopics(state.topics);
}

export async function addBlobTopic(label, options = {}) {
  const state = await readBlobState();
  const topicLabel = String(label || '').trim();
  if (!topicLabel) throw new Error('Topic label is empty');

  const topics = normalizeTopics(state.topics);
  const parentId = normalizeTopicId(options.parentId);
  const parent = parentId ? topics.find((topic) => topic.id === parentId) : null;
  if (parentId && !parent) throw new Error('Parent topic is missing');

  const id = uniqueTopicId(topics, slugifyTopic(topicLabel));
  const topic = {
    id,
    label: topicLabel,
    ...(parent ? { parentId: parent.id } : {})
  };

  state.topics = [...(state.topics || []), topic];
  await writeBlobState(state);
  return topic;
}

export async function addPendingPublication(input) {
  const pending = {
    id: crypto.randomBytes(8).toString('base64url'),
    createdAt: new Date().toISOString(),
    text: '',
    media: [],
    adminId: '',
    chatId: '',
    ...input
  };

  await put(getPendingPath(pending.id), JSON.stringify(pending), withBlobToken({
    access: 'public',
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 60
  }));
  return pending;
}

export async function getPendingPublication(id) {
  const pendingId = String(id || '').trim();
  if (!pendingId) return null;

  try {
    return await readBlobJson(getPendingPath(pendingId));
  } catch (error) {
    if (isMissingBlobError(error)) return null;
    throw error;
  }
}

export async function deletePendingPublication(id) {
  const pendingId = String(id || '');
  if (!pendingId) return;
  await del(getPendingPath(pendingId), withBlobToken()).catch(() => {});
}

export async function setAdminTopicSelection(adminId, topicId) {
  const state = await readBlobState();
  const topics = normalizeTopics(state.topics);
  const topic = getTopicById(topics, topicId);

  state.adminTopicSelections = {
    ...(state.adminTopicSelections || {}),
    [String(adminId)]: topic.id
  };
  await writeBlobState(state);
  return topic;
}

export async function getAdminTopicSelection(adminId) {
  const state = await readBlobState();
  const topicId = state.adminTopicSelections?.[String(adminId)] || 'other';
  return getTopicById(state.topics, topicId);
}

export async function deleteBlobPosts(ids) {
  const state = await readBlobState();
  const idSet = new Set(ids.map((id) => String(id || '')));
  const before = state.posts.length;
  
  const postsToDelete = state.posts.filter((p) => idSet.has(p.id));
  state.posts = state.posts.filter((post) => !idSet.has(post.id));

  if (state.posts.length === before) {
    return false;
  }

  const urlsToDelete = postsToDelete
    .flatMap((p) => p.media || [])
    .map((m) => m.url)
    .filter(Boolean);

  if (urlsToDelete.length > 0) {
    await del(urlsToDelete, withBlobToken()).catch((e) => console.error('Blob delete error:', e));
  }

  await writeBlobState(state);
  return true;
}

export async function renameBlobMedia(postId, mediaIndex, newName) {
  const state = await readBlobState();
  const post = state.posts.find((p) => p.id === postId);
  if (!post || !post.media || !post.media[mediaIndex]) return false;
  
  post.media[mediaIndex].name = newName;
  await writeBlobState(state);
  return true;
}

export async function deleteBlobPost(id) {
  return deleteBlobPosts([id]);
}

export async function getRecentBlobPosts(limit = 10) {
  const state = await readBlobState();
  return [...state.posts]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
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
  const blob = await put(pathname, buffer, withBlobToken({
    access: 'public',
    contentType,
    addRandomSuffix: false,
    cacheControlMaxAge: 31536000
  }));

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
    adminCodes: Array.isArray(state?.adminCodes) ? state.adminCodes : [],
    topics: Array.isArray(state?.topics) ? state.topics : [],
    pendingPublications: Array.isArray(state?.pendingPublications) ? state.pendingPublications : [],
    adminTopicSelections: state?.adminTopicSelections && typeof state.adminTopicSelections === 'object'
      ? state.adminTopicSelections
      : {}
  };
}

function uniqueTopicId(topics, baseId) {
  const existing = new Set(topics.map((topic) => topic.id));
  const normalized = normalizeTopicId(baseId) || `topic-${Date.now().toString(36)}`;
  let id = normalized;
  let index = 2;

  while (existing.has(id)) {
    id = `${normalized}-${index}`;
    index += 1;
  }

  return id;
}

function getPendingPath(id) {
  return `${pendingPrefix}/${encodeURIComponent(id)}.json`;
}

async function getLatestStatePathname() {
  const result = await list(withBlobToken({
    prefix: statePrefix,
    limit: 1000
  }));
  const latest = [...(result.blobs || [])]
    .filter((blob) => blob.pathname.endsWith('.json'))
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))[0];

  return latest?.pathname || '';
}

async function readBlobJson(pathname) {
  const result = await get(pathname, withBlobToken({ access: 'public' }));
  if (!result?.stream) return null;

  const raw = await streamToString(result.stream);
  return JSON.parse(raw);
}

function withBlobToken(options = {}) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  return token ? { ...options, token } : options;
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

export async function deleteBlobTopic(topicId) {
  const state = await readBlobState();
  const before = state.topics.length;
  
  const idsToDelete = new Set([topicId]);
  for (const topic of state.topics) {
    if (topic.parentId === topicId) {
      idsToDelete.add(topic.id);
    }
  }

  state.topics = state.topics.filter((topic) => !idsToDelete.has(topic.id));
  
  if (state.topics.length === before) {
    return false;
  }

  await writeBlobState(state);
  return true;
}
