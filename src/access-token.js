import crypto from 'node:crypto';

export function createAccessToken({ months, secret }) {
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setMonth(expiresAt.getMonth() + months);

  const payload = {
    v: 1,
    months,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    nonce: crypto.randomBytes(12).toString('base64url')
  };

  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

export function createCompactAccessToken({ months = 0, days = 0, secret }) {
  const now = new Date();
  const expiresAt = new Date(now);
  if (days) {
    expiresAt.setDate(expiresAt.getDate() + days);
  } else {
    expiresAt.setMonth(expiresAt.getMonth() + months);
  }

  const payload = Buffer.alloc(10);
  payload.writeUInt8(2, 0);
  payload.writeUInt8(days ? 200 + days : months, 1);
  payload.writeUInt32BE(Math.floor(expiresAt.getTime() / 1000), 2);
  crypto.randomBytes(4).copy(payload, 6);

  const body = payload.toString('base64url');
  const signature = signBuffer(payload, secret).subarray(0, 8).toString('base64url');
  return `${body}.${signature}`;
}

export function verifyAccessToken(token, secret) {
  const payload = parseAccessToken(token, secret);
  if (!payload?.expiresAt || new Date(payload.expiresAt) < new Date()) return null;
  return payload;
}

export function parseAccessToken(token, secret) {
  const compact = parseCompactAccessToken(token, secret);
  if (compact) return compact;

  const [body, signature] = String(token || '').split('.');
  if (!body || !signature || !timingSafeEqual(signature, sign(body, secret))) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload;
  } catch {
    return null;
  }
}

export function parseCompactAccessToken(token, secret) {
  const [body, signature] = String(token || '').split('.');
  if (!body || !signature) return null;

  let payload;
  try {
    payload = Buffer.from(body, 'base64url');
  } catch {
    return null;
  }

  if (payload.length !== 10 || payload.readUInt8(0) !== 2) return null;

  const expected = signBuffer(payload, secret).subarray(0, 8).toString('base64url');
  if (!timingSafeEqual(signature, expected)) return null;

  const duration = payload.readUInt8(1);
  const days = duration >= 200 ? duration - 200 : 0;
  const months = days ? 0 : duration;
  const expiresAt = new Date(payload.readUInt32BE(2) * 1000).toISOString();

  return {
    v: 2,
    months,
    ...(days ? { days } : {}),
    expiresAt
  };
}

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function signBuffer(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest();
}

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
