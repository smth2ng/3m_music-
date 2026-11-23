const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '../dist');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png' };
function start(port = 4380) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (!url.pathname.startsWith('/3m_music-/')) { res.writeHead(404).end('Not found'); return; }
      let requested = decodeURIComponent(url.pathname.slice('/3m_music-/'.length));
      if (requested.endsWith('/') || !requested) requested += 'index.html';
      const file = path.resolve(root, requested);
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      const data = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { res.writeHead(404).end('Not found'); }
  }).listen(port, '127.0.0.1');
}
module.exports = { start };
if (require.main === module) start(Number(process.env.AUDIT_PORT || 4380));
