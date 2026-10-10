'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

// ---------- 配置 ----------

const ROOT = __dirname;
const DIST = path.join(ROOT, 'web', 'dist');
const PORT = Number(process.env.PORT || 3000);
const CNB_API = 'https://api.cnb.cool';
const PROXY_PREFIX = '/api/proxy';

// 零依赖读取 .env（不覆盖已存在的环境变量）
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.join(ROOT, '.env'));

const TOKEN = process.env.CNB_TOKEN;
if (!TOKEN) {
  console.error(
    '\n[错误] 未设置 CNB_TOKEN 环境变量。\n' +
      '      请执行: export CNB_TOKEN=你的令牌\n' +
      '      或在项目根目录创建 .env 文件（参考 .env.example）。\n'
  );
  process.exit(1);
}

// CNB 顶层路径白名单，非白名单一律拒绝，避免被当成任意 URL 代理
const ALLOWED_TOP = new Set(['user', 'users', 'search', 'events', 'ranks']);

// ---------- 工具 ----------

function sendJson(res, status, data) {
  const buf = Buffer.from(JSON.stringify(data));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
  });
  res.end(buf);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

function serveStatic(req, res) {
  if (!fs.existsSync(DIST)) {
    return sendJson(res, 503, {
      errcode: 503,
      errmsg: '前端尚未构建，请在项目根目录执行 npm run build',
    });
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return sendJson(res, 400, { errcode: 400, errmsg: '非法路径' });
  }

  // 防目录穿越
  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(DIST, safePath);
  if (!filePath.startsWith(DIST)) filePath = DIST;

  let stat = null;
  try {
    stat = fs.statSync(filePath);
  } catch {
    stat = null;
  }

  // SPA fallback
  if (!stat || stat.isDirectory()) {
    filePath = path.join(DIST, 'index.html');
    try {
      stat = fs.statSync(filePath);
    } catch {
      return sendJson(res, 404, { errcode: 404, errmsg: 'Not Found' });
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const isHashed = /-[A-Za-z0-9_]{8,}\.(js|css|woff2?|ttf|png|jpe?g|svg)$/.test(filePath);

  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': isHashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  });

  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(filePath).pipe(res);
}

// ---------- 代理 ----------

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 20 * 1024 * 1024) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function handleProxy(req, res) {
  const rawUrl = new URL(req.url, 'http://localhost');
  // 去掉 /api/proxy 前缀，剩余部分原样作为 CNB 路径
  const target = rawUrl.pathname.slice(PROXY_PREFIX.length).replace(/^\/+/, '');
  const query = rawUrl.search;

  if (!target) {
    return sendJson(res, 400, { errcode: 400, errmsg: '缺少目标路径' });
  }

  // SSRF 防护：目标必须是白名单顶层路径，或 org/repo/-/... 形式
  const segments = target.split('/').filter(Boolean);
  const decoded = segments.map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });
  const allowed =
    ALLOWED_TOP.has(decoded[0]) ||
    (decoded.length >= 3 && decoded[2] === '-') ||
    (decoded.length === 1 && decoded[0] !== '..' && decoded[0] !== '.');

  if (!allowed) {
    return sendJson(res, 403, { errcode: 403, errmsg: '禁止访问该路径' });
  }

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'DELETE';
  let body;
  if (hasBody) {
    try {
      body = await readBody(req);
    } catch (err) {
      return sendJson(res, 413, { errcode: 413, errmsg: err.message });
    }
  }

  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    Accept: 'application/vnd.cnb.api+json',
    'User-Agent': 'cnb-issue-pr-manager',
  };
  if (body && body.length) {
    headers['Content-Type'] = req.headers['content-type'] || 'application/json';
  }

  const upstream = await fetch(CNB_API + '/' + target + query, {
    method: req.method,
    headers,
    body: body && body.length ? body : undefined,
  });

  const buf = Buffer.from(await upstream.arrayBuffer());
  const outHeaders = {
    'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
  };
  res.writeHead(upstream.status, outHeaders);
  res.end(buf);
}

// ---------- 服务 ----------

const server = http.createServer((req, res) => {
  const pathname = (req.url || '').split('?')[0];

  if (pathname === PROXY_PREFIX || pathname.startsWith(PROXY_PREFIX + '/')) {
    handleProxy(req, res).catch((err) => {
      console.error('[proxy error]', err);
      if (!res.headersSent) sendJson(res, 502, { errcode: 502, errmsg: err.message });
      else res.end();
    });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { errcode: 405, errmsg: 'Method Not Allowed' });
  }

  serveStatic(req, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[cnb-manager] 已启动: http://localhost:${PORT}`);
  console.log(`[cnb-manager] 代理前缀: ${PROXY_PREFIX}/*  ->  ${CNB_API}/*`);
});