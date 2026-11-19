import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
export async function handleRequest(req, res) {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/') pathname = '/index.html';
    const allowed = ['/index.html', '/styles.css', '/favicon.svg'].includes(pathname) || /^\/(src|assets)\/[\w./-]+$/.test(pathname);
    const filename = path.resolve(root, '.' + pathname);
    if (!allowed || !filename.startsWith(root) || pathname.split('/').some(part => part.startsWith('.'))) {
      res.writeHead(404); res.end('Not found'); return;
    }
    const body = await readFile(filename);
    res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(404); res.end('Not found'); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = http.createServer(handleRequest);
  server.listen(port, '127.0.0.1', () => console.log(`ShelfCheck is ready at http://localhost:${port}`));
  server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
}
