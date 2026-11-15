#!/usr/bin/env node
// Local server for Nano Studio. No dependencies.
//
//   node serve.mjs            -> http://localhost:8000
//   node serve.mjs 3000       -> http://localhost:3000
//
// It listens on 127.0.0.1 only, so nothing else on your network can reach it.
// Chrome treats localhost as a secure origin, which is what the built-in model
// and the service worker need (file:// pages get neither).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 8000);
const HOST = '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.css': 'text/css; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, `http://${HOST}`).pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(ROOT, path));
    // stay inside the project folder, and keep dotfiles (.git) private
    if (!file.startsWith(ROOT) || file.slice(ROOT.length).split(sep).some((part) => part.startsWith('.'))) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (err) {
    res.writeHead(err.code === 'ENOENT' || err.code === 'EISDIR' ? 404 : 500).end('Not found');
  }
});

server.on('error', (err) => {
  console.error(err.code === 'EADDRINUSE'
    ? `Port ${PORT} is busy. Try: node serve.mjs ${PORT + 1}`
    : err.message);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`Nano Studio is running at http://localhost:${PORT}`);
  console.log('Only this machine can reach it. Press Ctrl+C to stop.');
});
