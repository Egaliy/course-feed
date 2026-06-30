import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { verifyAccessToken } from '../src/access-token.js';
import { renderFeedPage, renderRegistrationPage } from '../src/render.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const title = process.env.COURSE_TITLE || 'Лента курса';
const accessSecret = process.env.ACCESS_TOKEN_SECRET || process.env.BOT_TOKEN || 'local-access-secret';
const dbPath = path.join(rootDir, 'data', 'db.json');

export default async function handler(req, res) {
  const state = await readState();
  const token = getAccessToken(req);
  const access = token ? getAccess(token, state) : null;
  const html = isActiveAccess(access)
    ? renderFeedPage({ title, posts: getPosts(state), access })
    : renderRegistrationPage({ title });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
}

function getAccessToken(req) {
  return String(req.query.k || req.query.code || req.query.access || req.query.token || '').trim();
}

async function readState() {
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
  return verifyAccessToken(token, accessSecret)
    || (state.accessLinks || []).find((link) => link.token === token);
}

function isActiveAccess(access) {
  return Boolean(access) && new Date(access.expiresAt) >= new Date();
}
