import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from './api/index.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
for (const envPath of [path.join(root, '.env'), path.resolve(root, '../../../skills/nodak-airtable/.env')]) {
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}
if (!fs.existsSync(path.join(root, '.env'))) process.env.AIRTABLE_BASE_ID = 'app90BBDWqJnar9Ve';
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };
http.createServer(async (req, res) => {
  if (req.url.startsWith('/api')) return handler(req, res);
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); res.end('Not found'); return;
  }
  res.setHeader('Content-Type', `${types[path.extname(file)] || 'application/octet-stream'}; charset=utf-8`);
  fs.createReadStream(file).pipe(res);
}).listen(Number(process.env.PORT) || 3000, '127.0.0.1', () => console.log(`TOC월드 local: http://127.0.0.1:${process.env.PORT || 3000}`));
