import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseAccessToken } from '../src/access-token.js';
import { deleteBlobPosts, deleteBlobPost, deleteBlobTopic, hasBlobStorage, readBlobState } from '../src/blob-storage.js';
import { renderFeedPage, renderManagePage, renderRegistrationPage } from '../src/render.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const title = getTitle();
const accessSecret = process.env.ACCESS_TOKEN_SECRET || 'course-feed-access-v1';
const dbPath = path.join(rootDir, 'data', 'db.json');

export default async function handler(req, res) {
  const state = await readState();

  if (isManageRequest(req)) {
    if (req.method === 'POST') {
      if (req.body.action === 'delete-topic') {
        const topicId = String(req.body.topicId || '').trim();
        if (topicId) {
          await deleteBlobTopic(topicId);
        }
        redirect(res, `/?manage=${encodeURIComponent(getSiteAdminKey())}`);
        return;
      }
      
      const ids = getPostIdsFromBody(req.body);
      await deleteBlobPosts(ids);
      redirect(res, `/?manage=${encodeURIComponent(getSiteAdminKey())}&notice=${encodeURIComponent(`Удалено: ${ids.length}`)}`);
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
  const html = access && isActiveAccess(access)
    ? renderFeedPage({ title, posts: getPosts(state), access, token, view: req.query.view, topics: state.topics })
    : renderRegistrationPage({ title, state: access ? 'expired' : 'default' });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
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

function getPostIdsFromBody(body) {
  if (typeof body === 'string') {
    return new URLSearchParams(body).getAll('postId').filter(Boolean);
  }

  const value = body?.postId;
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value) return [String(value)];
  return [];
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
