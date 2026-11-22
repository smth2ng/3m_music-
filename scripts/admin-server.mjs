import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

const sessions = new Map();
let attempts = 0;
let windowEnd = 0;
const ttl = 8 * 60 * 60 * 1000;
const digest = value => createHash('sha256').update(value).digest();
export async function adminRequest(req, res, url) {
  if (!url.pathname.startsWith('/api/admin/')) return false;
  res.setHeader('Cache-Control', 'no-store');
  const reply = (code, data) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };
  if (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_GITHUB_TOKEN || !process.env.ADMIN_ORIGIN) {
    reply(503, { message: 'На сервере необходимо задать ADMIN_PASSWORD, ADMIN_GITHUB_TOKEN и ADMIN_ORIGIN.' });
    return true;
  }
  if (req.method !== 'GET' && req.headers.origin !== process.env.ADMIN_ORIGIN) {
    reply(403, { message: 'Недопустимый источник запроса.' });
    return true;
  }
  const now = Date.now();
  for (const [key, expiry] of sessions) if (expiry <= now) sessions.delete(key);
  const session = req.headers.cookie?.match(/(?:^|;\s*)admin_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  const secure = process.env.ADMIN_ORIGIN.startsWith('https:') ? '; Secure' : '';
  const cookie = (value, age) => res.setHeader('Set-Cookie', 'admin_session=' + value + '; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=' + age + secure);
  async function body() {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 12 * 1024 * 1024) throw new Error('Слишком большой запрос.');
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString());
  }
  try {
    if (url.pathname === '/api/admin/login' && req.method === 'POST') {
      if (now > windowEnd) { attempts = 0; windowEnd = now + 60000; }
      if (++attempts > 10) { reply(429, { message: 'Слишком много попыток. Подождите минуту.' }); return true; }
      const input = await body();
      if (typeof input.password !== 'string' || !timingSafeEqual(digest(input.password), digest(process.env.ADMIN_PASSWORD))) {
        reply(401, { message: 'Неверный пароль.' });
        return true;
      }
      if (session) sessions.delete(session);
      const id = randomBytes(32).toString('hex');
      sessions.set(id, now + ttl);
      cookie(id, ttl / 1000);
      reply(200, { ok: true });
      return true;
    }
    if (!session || !sessions.has(session)) {
      reply(401, { message: 'Войдите по паролю. Возможно, срок сессии истёк.' });
      return true;
    }
    if (url.pathname === '/api/admin/logout' && req.method === 'POST') {
      sessions.delete(session);
      cookie('', 0);
      reply(200, { ok: true });
      return true;
    }
    const prefix = '/api/admin/github';
    const path = url.pathname.slice(prefix.length);
    const permitted =
      (req.method === 'GET' && (/^\/git\/ref\/heads\/main$/.test(path) || /^\/git\/commits\/[a-f0-9]{40}$/.test(path) || path === '/contents/public/data/artists.json')) ||
      (req.method === 'POST' && ['/git/blobs', '/git/trees', '/git/commits'].includes(path)) ||
      (req.method === 'PATCH' && path === '/git/refs/heads/main');
    if (!url.pathname.startsWith(prefix + '/') || !permitted) {
      reply(404, { message: 'Маршрут не найден.' });
      return true;
    }
    const payload = req.method === 'GET' ? undefined : await body();
    const upstream = await fetch('https://api.github.com/repos/smth2ng/3m_music-' + path + url.search, {
      method: req.method,
      headers: { Authorization: 'Bearer ' + process.env.ADMIN_GITHUB_TOKEN, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(30000),
      redirect: 'error'
    });
    const data = await upstream.json();
    if (!upstream.ok) {
      reply(upstream.status, { message: upstream.status === 403 ? 'GitHub запретил сохранение. Проверьте серверный токен: Contents — Read and write и ограничения ветки main.' : data.message ?? 'Ошибка GitHub.' });
      return true;
    }
    reply(upstream.status, data);
  } catch {
    reply(502, { message: 'Не удалось обработать запрос. Проверьте соединение с GitHub и повторите попытку.' });
  }
  return true;
}
