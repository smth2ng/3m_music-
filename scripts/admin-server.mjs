import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

const sessions = new Map();
let attempts = 0;
let windowEnd = 0;
const ttl = 8 * 60 * 60 * 1000;
const digest = value => createHash('sha256').update(value).digest();
export async function adminRequest(req, res, url) {
  if (!url.pathname.startsWith('/api/admin/')) return false;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
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
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', chunk => {
        size += chunk.length;
        if (size > 12 * 1024 * 1024) {
          reject(Object.assign(new Error('Слишком большой запрос.'), { status: 413 }));
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (size > 12 * 1024 * 1024) return;
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch { reject(Object.assign(new Error('Некорректный JSON.'), { status: 400 })); }
      });
      req.on('error', () => reject(Object.assign(new Error('Не удалось прочитать запрос.'), { status: 400 })));
    });
  }
  try {
    if (url.pathname === '/api/admin/login' && req.method === 'POST') {
      if (now > windowEnd) { attempts = 0; windowEnd = now + 60000; }
      if (++attempts > 10) { reply(429, { message: 'Слишком много попыток. Подождите минуту.' }); return true; }
      const input = await body();
      if (!input || typeof input.password !== 'string') {
        reply(400, { message: 'Укажите пароль.' });
        return true;
      }
      if (!timingSafeEqual(digest(input.password), digest(process.env.ADMIN_PASSWORD))) {
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
    if (url.pathname === '/api/admin/media' && req.method === 'GET') {
      const path = url.searchParams.get('path') ?? '';
      if (!/^assets\/uploads\/[a-zA-Z0-9._-]+\.(png|jpe?g|webp)$/i.test(path) || path.includes('..')) {
        reply(400, { message: 'Некорректный путь фотографии.' });
        return true;
      }
      const upstream = await fetch('https://api.github.com/repos/smth2ng/3m_music-/contents/public/' + path, {
        headers: { Authorization: 'Bearer ' + process.env.ADMIN_GITHUB_TOKEN, Accept: 'application/vnd.github.raw+json' },
        signal: AbortSignal.timeout(30000), redirect: 'error'
      });
      if (!upstream.ok) { reply(upstream.status, { message: 'Не удалось загрузить фотографию.' }); return true; }
      const bytes = Buffer.from(await upstream.arrayBuffer());
      if (bytes.length > 8 * 1024 * 1024) { reply(413, { message: 'Слишком большая фотография.' }); return true; }
      const extension = path.toLowerCase();
      const type = extension.endsWith('.png') ? 'image/png' : extension.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
      res.writeHead(200, { 'Content-Type': type });
      res.end(bytes);
      return true;
    }
    const prefix = '/api/admin/github';
    const path = url.pathname.slice(prefix.length);
    const permitted =
      (req.method === 'GET' && (/^\/git\/ref\/heads\/main$/.test(path) || /^\/git\/commits\/[a-f0-9]{40}$/.test(path) || /^\/contents\/public\/data\/(artists|teachers|releases)\.json$/.test(path))) ||
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
  } catch (error) {
    if (error.status) { reply(error.status, { message: error.message }); return true; }
    reply(502, { message: 'Не удалось обработать запрос. Проверьте соединение с GitHub и повторите попытку.' });
  }
  return true;
}
