'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

// ---------- 配置 ----------

const ROOT = __dirname;
const DIST = path.join(ROOT, 'web', 'dist');
const PORT = Number(process.env.PORT || 3000);
const CNB_API = 'https://api.cnb.cool';
const CNB_ASSET_HOST = 'asset.cnb.cool';
const PROXY_PREFIX = '/api/proxy';
// 附件二进制代理：下载走 /api/asset/*，上传走 /api/upload
const ASSET_PREFIX = '/api/asset';
const UPLOAD_PREFIX = '/api/upload';
const MAX_UPLOAD = 20 * 1024 * 1024;

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

function readBody(req, limit = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    req.on('data', (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > limit) {
        done = true;
        // 必须 drain 掉剩余数据，否则客户端会收到 ECONNRESET 而不是 413
        req.resume();
        reject(new Error('请求体过大'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!done) resolve(Buffer.concat(chunks));
    });
    req.on('error', (err) => {
      if (!done) reject(err);
    });
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

  // SSRF 防护：目标必须是白名单顶层路径，或 org/repo/-/... 、org/-/... 形式
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
    // {org}/{repo}/-/{resource}...
    (decoded.length >= 3 && decoded[2] === '-') ||
    // {org}/-/{resource}...
    (decoded.length >= 2 && decoded[1] === '-') ||
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

// ---------- 附件 ----------

// 附件路径白名单。只放行 Issue/PR 的 imgs 与 files 两类，
// 其余一律拒绝，避免把附件代理变成任意路径读取器。
// 注：CNB 的实际路径深度不固定，
// 图片为 issues/{group}/{token}/{uuid}.png（3 段），
// 文件为 issues/{group}/{token}/{uuid}/{name}（4 段），
// 因此这里只约束结构，不写死段数。
//
// 文件名段放宽到「任意非斜杠字符」：CNB 保留上传时的原始文件名，
// 实测会出现空格与中文（如「测试 报告 v1.pdf」），写死 [A-Za-z0-9._-]
// 会让这类附件直接 403。穿越防护由下面的 normalize + 拒绝 `..` 段负责。
const ASSET_PATH_RE =
  /^[^/]+\/[^/]+\/-\/(imgs|files)\/(issues|pulls)\/[^/]+(?:\/[^/]+)+$/;

function safeAssetTarget(rawPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  // 规范化后再匹配，挡住 ../ 之类的穿越写法
  const norm = path.posix.normalize(decoded).replace(/^\/+/, '');
  if (norm !== decoded.replace(/^\/+/, '')) return null;
  // 逐段确认没有 . / .. 段，避免 normalize 之后的残余
  if (norm.split('/').some((seg) => seg === '.' || seg === '..')) return null;
  return ASSET_PATH_RE.test(norm) ? norm : null;
}

/**
 * 附件下载。CNB 的 asset_link / download_url 是无凭据的相对或绝对地址，
 * 私有仓库直接访问会 404 或 401，必须由服务端带上令牌转发。
 */
async function handleAsset(req, res) {
  // 取原始 url 而非 new URL(...).pathname：URL 构造器会先把 `..` 折叠掉，
  // 那样穿过来的 `a/../b` 会被悄悄改写，穿越写法就检测不到了。
  const rawPath = (req.url || '').split('?')[0].slice(ASSET_PREFIX.length);
  const target = safeAssetTarget(rawPath);

  if (!target) {
    return sendJson(res, 403, { errcode: 403, errmsg: '禁止访问该附件路径' });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { errcode: 405, errmsg: 'Method Not Allowed' });
  }

  const upstream = await fetch(CNB_API + '/' + target, {
    method: req.method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'User-Agent': 'cnb-issue-pr-manager',
    },
  });

  const buf = Buffer.from(await upstream.arrayBuffer());

  // 附件路径含不可猜测的随机段，但仓库名与 issue 号可枚举，
  // 因此用私有缓存避免被中间层共享缓存串号。
  res.writeHead(upstream.status, {
    'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
    'Content-Length': buf.length,
    'Cache-Control': 'private, max-age=3600',
  });
  res.end(req.method === 'HEAD' ? undefined : buf);
}

/**
 * 附件上传中转。asset.cnb.cool 的 CORS 只放行 cnb.cool 来源，
 * 部署在其它域名时浏览器无法直连 PUT，必须由服务端转发裸字节。
 */
async function handleUpload(req, res) {
  if (req.method !== 'PUT' && req.method !== 'POST') {
    return sendJson(res, 405, { errcode: 405, errmsg: 'Method Not Allowed' });
  }

  const rawUrl = new URL(req.url, 'http://localhost');
  const uploadUrl = rawUrl.searchParams.get('url');
  if (!uploadUrl) {
    return sendJson(res, 400, { errcode: 400, errmsg: '缺少 url 参数' });
  }

  // 只允许转发到 CNB 的对象存储，避免被当作任意 HTTP 中转
  let parsed;
  try {
    parsed = new URL(uploadUrl);
  } catch {
    return sendJson(res, 400, { errcode: 400, errmsg: 'url 不合法' });
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== CNB_ASSET_HOST) {
    return sendJson(res, 403, { errcode: 403, errmsg: '禁止上传到该地址' });
  }

  let body;
  try {
    body = await readBody(req, MAX_UPLOAD);
  } catch (err) {
    return sendJson(res, 413, { errcode: 413, errmsg: err.message });
  }

  const upstream = await fetch(parsed.toString(), {
    method: req.method,
    headers: {
      'Content-Type': req.headers['content-type'] || 'application/octet-stream',
      'Content-Length': String(body.length),
    },
    body,
  });

  const buf = Buffer.from(await upstream.arrayBuffer());
  res.writeHead(upstream.status, {
    'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
  });
  res.end(buf);
}

// ---------- 服务 ----------

const server = http.createServer((req, res) => {
  const pathname = (req.url || '').split('?')[0];

  if (pathname === UPLOAD_PREFIX) {
    handleUpload(req, res).catch((err) => {
      console.error('[upload error]', err);
      if (!res.headersSent) sendJson(res, 502, { errcode: 502, errmsg: err.message });
      else res.end();
    });
    return;
  }

  if (pathname === ASSET_PREFIX || pathname.startsWith(ASSET_PREFIX + '/')) {
    handleAsset(req, res).catch((err) => {
      console.error('[asset error]', err);
      if (!res.headersSent) sendJson(res, 502, { errcode: 502, errmsg: err.message });
      else res.end();
    });
    return;
  }

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
  console.log(`[cnb-manager] 附件下载: ${ASSET_PREFIX}/*  ->  ${CNB_API}/*`);
  console.log(`[cnb-manager] 附件上传: ${UPLOAD_PREFIX}?url=...  ->  ${CNB_ASSET_HOST}`);
});
// merge flow test

// another change
