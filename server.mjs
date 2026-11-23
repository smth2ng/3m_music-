import http from 'node:http';
import { adminRequest } from './scripts/admin-server.mjs';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve(process.env.SERVE_DIST === '1' ? 'dist' : 'public');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain' };
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/admin/config.js') {
      const enabled = Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_GITHUB_TOKEN && process.env.ADMIN_ORIGIN);
      res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
      res.end('export const serverMode = ' + enabled + ';');
      return;
    }
    if (await adminRequest(req, res, url)) return;
    const pathname = decodeURIComponent(url.pathname);
    const file = resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    let data = await readFile(file);
    if (['/admin/', '/admin/index.html'].includes(pathname) && process.env.ADMIN_PASSWORD && process.env.ADMIN_GITHUB_TOKEN && process.env.ADMIN_ORIGIN) {
      data = Buffer.from(data.toString().replace('href="../index.html"', 'href="https://smth2ng.github.io/3m_music-/"'));
    }
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log(`3М music: port ${process.env.PORT || 3000}`));
