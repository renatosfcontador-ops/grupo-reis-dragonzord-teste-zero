'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const REPORTS_DIR = path.join(ROOT, 'reports');
const REPORTS_FILE = path.join(REPORTS_DIR, 'reports.json');
const OVERRIDES_FILE = path.join(REPORTS_DIR, 'url-overrides.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.map': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

const VERDICTS = new Set(['aprovado', 'patina', 'reprovado', 'pendente']);

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

function readJsonFile(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonFile(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new Error('payload_too_large'));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('invalid_json'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400);
    return res.end('Bad Request');
  }

  if (rel === '/' || rel === '') rel = '/index.html';

  const filePath = path.resolve(ROOT, `.${rel}`);
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  const relative = path.relative(ROOT, filePath).replace(/\\/g, '/');
  const blocked = relative.startsWith('reports/')
    || relative.startsWith('docs/')
    || relative.startsWith('scripts/')
    || relative.startsWith('.github/')
    || relative.startsWith('node_modules/')
    || relative === 'server.js'
    || relative === 'package.json'
    || relative === 'package-lock.json'
    || relative.startsWith('.git/');

  if (blocked) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('404 Not Found');
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': ext === '.html' || ext === '.json' ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    if (req.method === 'HEAD') return res.end();
    res.end(data);
  });
}

async function handleApi(req, res, pathname, query) {
  if (pathname === '/api/health' && req.method === 'GET') {
    const catalog = readJsonFile(path.join(ROOT, 'projects.json'), null);
    return sendJson(res, 200, {
      ok: true,
      service: 'dragonzord',
      instance: catalog?.meta?.instance || 'unknown',
      time: new Date().toISOString(),
    });
  }

  if (pathname === '/api/projects' && req.method === 'GET') {
    const projects = readJsonFile(path.join(ROOT, 'projects.json'), null);
    if (!projects) return sendJson(res, 500, { error: 'projects.json não encontrado' });
    return sendJson(res, 200, projects);
  }

  if (pathname === '/api/reports' && req.method === 'GET') {
    return sendJson(res, 200, readJsonFile(REPORTS_FILE, []));
  }

  if (pathname === '/api/reports' && req.method === 'POST') {
    const body = await parseBody(req);
    const projectId = Number(body.projectId ?? body.agentId);
    const operator = String(body.operator || '').trim().slice(0, 120);
    const verdict = VERDICTS.has(body.verdict) ? body.verdict : 'pendente';
    const usability = Math.min(5, Math.max(0, Number(body.usability) || 0));
    const notes = String(body.notes || '').trim().slice(0, 2000);
    const report = {
      id: body.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      projectId: Number.isFinite(projectId) ? projectId : null,
      projectName: String(body.projectName || '').slice(0, 160),
      operator: operator || 'Anônimo',
      verdict,
      usability,
      notes,
      createdAt: body.createdAt || new Date().toISOString(),
    };
    const list = readJsonFile(REPORTS_FILE, []);
    list.unshift(report);
    writeJsonFile(REPORTS_FILE, list);
    return sendJson(res, 201, report);
  }

  if (pathname === '/api/reports' && req.method === 'DELETE') {
    const id = query.get('id');
    if (!id) return sendJson(res, 400, { error: 'id obrigatório' });
    const list = readJsonFile(REPORTS_FILE, []);
    const next = list.filter((report) => String(report.id) !== String(id));
    writeJsonFile(REPORTS_FILE, next);
    return sendJson(res, 200, { ok: true, removed: list.length - next.length });
  }

  if (pathname === '/api/urls' && req.method === 'GET') {
    return sendJson(res, 200, readJsonFile(OVERRIDES_FILE, {}));
  }

  if (pathname === '/api/urls' && req.method === 'PUT') {
    const body = await parseBody(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return sendJson(res, 400, { error: 'Esperado um objeto JSON com overrides por id.' });
    }
    writeJsonFile(OVERRIDES_FILE, body);
    return sendJson(res, 200, { ok: true, count: Object.keys(body).length });
  }

  return sendJson(res, 404, { error: 'Rota de API não encontrada' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');

  try {
    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname, url.searchParams);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      return res.end('Method Not Allowed');
    }
    serveStatic(req, res, pathname);
  } catch (error) {
    const status = error.message === 'payload_too_large' ? 413 : 400;
    sendJson(res, status, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`DragonZord online em http://localhost:${PORT}`);
  console.log(`API: http://localhost:${PORT}/api/health`);
  console.log(`Catálogo: http://localhost:${PORT}/projects.json`);
});