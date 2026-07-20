import path from 'node:path';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseAccessToken } from '../src/access-token.js';
import {
  deleteBlobPost,
  deleteBlobPosts,
  deleteBlobTopic,
  hasBlobStorage,
  readBlobState,
  registerAccessDevice,
  renameBlobMedia,
  updateBlobPostText
} from '../src/blob-storage.js';
import {
  renderDeviceLimitPage,
  renderFeedPage,
  renderManagePage,
  renderRegistrationPage
} from '../src/render.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const title = getTitle();
const accessSecret = process.env.ACCESS_TOKEN_SECRET || 'course-feed-access-v1';
const dbPath = path.join(rootDir, 'data', 'db.json');

export default async function handler(req, res) {
  const state = await readState();

  if (isManageRequest(req)) {
    if (req.method === 'POST') {
      const body = parseBody(req.body);

      if (body.action === 'delete-topic') {
        const topicId = String(body.topicId || '').trim();
        if (topicId) {
          await deleteBlobTopic(topicId);
        }
        redirect(res, `/?manage=${encodeURIComponent(getSiteAdminKey())}`);
        return;
      }
      
      if (body.action === 'rename-media') {
        const postId = String(body.postId || '').trim();
        const mediaIndex = parseInt(body.mediaIndex, 10);
        const newName = String(body.newName || '').trim();
        if (postId && !isNaN(mediaIndex)) {
          await renameBlobMedia(postId, mediaIndex, newName);
        }
        redirect(res, `/?manage=${encodeURIComponent(getSiteAdminKey())}`);
        return;
      }

      const updatePostId = getUpdatePostId(body);
      if (updatePostId) {
        const updated = await updateBlobPostText(updatePostId, getPostTextFromBody(body, updatePostId));
        redirect(res, `/?manage=${encodeURIComponent(getSiteAdminKey())}&notice=${encodeURIComponent(updated ? 'Материал обновлен' : 'Материал не найден')}`);
        return;
      }
      
      const ids = getPostIdsFromBody(body);
      const deletedResult = ids.length > 1
        ? await deleteBlobPosts(ids)
        : ids.length === 1
          ? await deleteBlobPost(ids[0])
          : false;
      const deleted = deletedResult ? ids.length : 0;
      redirect(res, `/?manage=${encodeURIComponent(getSiteAdminKey())}&notice=${encodeURIComponent(`Удалено: ${deleted}`)}`);
      return;
    }

    const notice = String(req.query.notice || '');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.status(200).send(renderManagePage({
      title,
      posts: getPosts(state),
      adminKey: getSiteAdminKey(),
      topics: state.topics,
      notice,
      view: String(req.query.view || 'all')
    }));
    return;
  }

  const token = getAccessToken(req);
  const access = token ? getAccess(token, state) : null;
  let html = renderRegistrationPage({ title, state: access ? 'expired' : 'default' });
  if (access && isActiveAccess(access)) {
    const device = await checkAccessDevice({ req, res, token });
    html = device.allowed
      ? renderFeedPage({ title, posts: getPosts(state), access, token, view: req.query.view, topics: state.topics })
      : renderDeviceLimitPage({ title, maxDevices: device.maxDevices });
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.status(200).send(html);
}

function isManageRequest(req) {
  const key = getSiteAdminKey();
  return Boolean(key) && String(req.query.manage || '') === key;
}

function getSiteAdminKey() {
  return process.env.SITE_ADMIN_KEY || process.env.TELEGRAM_WEBHOOK_SECRET || '';
}

function parseBody(body) {
  if (typeof body === 'object' && body !== null) return body;
  if (typeof body === 'string') {
    const params = new URLSearchParams(body);
    const result = {};
    for (const [key, value] of params.entries()) {
      if (result[key] !== undefined) {
        if (!Array.isArray(result[key])) result[key] = [result[key]];
        result[key].push(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
  return {};
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

function getUpdatePostId(body) {
  return String(body?.updatePostId || '').trim();
}

function getPostTextFromBody(body, id) {
  return String(body?.[`postText:${id}`] || '');
}

async function checkAccessDevice({ req, res, token }) {
  if (!hasBlobStorage()) return { allowed: true, devices: 1, maxDevices: getMaxDevices() };

  let deviceId = getCookie(req, 'course_device');
  if (!deviceId) {
    deviceId = crypto.randomBytes(16).toString('base64url');
    setCookie(res, 'course_device', deviceId);
  }

  return registerAccessDevice({
    token,
    deviceId,
    userAgent: req.headers['user-agent'] || '',
    maxDevices: getMaxDevices()
  });
}

function getMaxDevices() {
  return Math.max(1, Number(process.env.ACCESS_MAX_DEVICES || 3));
}

function getCookie(req, name) {
  const cookies = String(req.headers.cookie || '').split(';');
  const prefix = `${name}=`;
  const found = cookies.map((item) => item.trim()).find((item) => item.startsWith(prefix));
  return found ? decodeURIComponent(found.slice(prefix.length)) : '';
}

function setCookie(res, name, value) {
  res.setHeader('Set-Cookie', `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`);
}

function redirect(res, location) {
  res.statusCode = 303;
  res.setHeader('Location', location);
  res.end();
}

function getAccessToken(req) {
  return String(req.query.k || req.query.code || req.query.access || req.query.token || '').trim();
}

async function readState() {
  if (hasBlobStorage()) {
    return readBlobState();
  }

  try {
    const raw = await readFile(dbPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { posts: [], accessLinks: [] };
  }
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

function getTitle() {
  const value = String(process.env.COURSE_TITLE || '').trim();
  if (!value || value.includes('?') || value.includes('Р') || value.toLowerCase() === 'лента курса') {
    return 'Онлайн-пространство';
  }
  return value;
}
