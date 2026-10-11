const PROXY = '/api/proxy';

// 仓库标识形如 org/repo。其中的斜杠是 CNB 路径的一部分，不能做 URL 编码，
// 因此这里只做白名单字符校验，由后端负责最终把关。
const REPO_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const NUMBER_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function repoSeg(repo) {
  const r = String(repo || '');
  if (!REPO_RE.test(r)) {
    throw new ApiError(`仓库名不合法：${r || '(空)'}`, 0, null);
  }
  return r;
}

function numSeg(number) {
  const n = String(number || '');
  if (!NUMBER_RE.test(n)) {
    throw new ApiError(`编号不合法：${n || '(空)'}`, 0, null);
  }
  return n;
}

function orgSeg(org) {
  const o = String(org || '');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(o)) {
    throw new ApiError(`组织名不合法：${o || '(空)'}`, 0, null);
  }
  return o;
}

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

// 对高频、含义不直观的错误码给出可读提示
const ERR_HINT = {
  10023: '访问令牌权限不足，请在 CNB 重新签发包含该资源读写权限的令牌',
  2000054: 'state 与 state_reason 必须同时提交',
  5: '仓库或资源不存在，或当前令牌无访问权限，可点击顶部「仓库」切换',
};

async function request(method, pathname, { query, body } = {}) {
  let url = PROXY + pathname;
  if (query) {
    const qs = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const s = qs.toString();
    if (s) url += '?' + s;
  }

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('网络请求失败，请检查连接', 0, null);
  }

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const raw =
      (data && typeof data === 'object' && (data.errmsg || data.message)) ||
      `请求失败 (${res.status})`;
    const hint = data && typeof data === 'object' && ERR_HINT[data.errcode];
    const msg = hint ? `${raw} —— ${hint}` : raw;
    throw new ApiError(msg, res.status, data);
  }

  return data;
}

export const api = {
  get: (pathname, query) => request('GET', pathname, { query }),
  post: (pathname, body, query) => request('POST', pathname, { body, query }),
  put: (pathname, body) => request('PUT', pathname, { body }),
  patch: (pathname, body) => request('PATCH', pathname, { body }),
  del: (pathname, body) => request('DELETE', pathname, { body }),
};

// ---------- 用户 / 仓库 ----------

/**
 * 获取可管理的仓库列表。
 *
 * 1) 优先 /user/repos（需要 account-engage:r），是权威来源；
 * 2) 令牌缺少该权限时回退到 /{org}/-/repos，只需 repo 相关权限，
 *    因此只要记得组织名（可从上次选择的仓库推出）就仍能列出仓库。
 * 两条路都失败时返回空数组，由前端退化为纯手动输入。
 */
export async function getRepos(fallbackOrg) {
  try {
    // role 只接受 owner（也是默认值），传其它值会返回 errcode 3
    const list = await api.get('/user/repos', { page: 1, page_size: 100 });
    if (Array.isArray(list) && list.length) return list;
  } catch {
    // 缺少 account-engage:r，走下面的回退
  }

  if (!fallbackOrg) return [];
  try {
    const list = await api.get(`/${orgSeg(fallbackOrg)}/-/repos`, {
      page: 1,
      page_size: 100,
    });
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** 组织下的仓库列表（用于搜索 / 展开某个组织） */
export const listOrgRepos = (org, query) => api.get(`/${orgSeg(org)}/-/repos`, query);

// ---------- Issue ----------

export const listIssues = (repo, query) => api.get(`/${repoSeg(repo)}/-/issues`, query);
export const getIssue = (repo, number) => api.get(`/${repoSeg(repo)}/-/issues/${numSeg(number)}`);
export const createIssue = (repo, body) => api.post(`/${repoSeg(repo)}/-/issues`, body);
export const patchIssue = (repo, number, body) =>
  api.patch(`/${repoSeg(repo)}/-/issues/${numSeg(number)}`, body);

export const getIssueLabels = (repo, number) =>
  api.get(`/${repoSeg(repo)}/-/issues/${numSeg(number)}/labels`);
export const putIssueLabels = (repo, number, labels) =>
  api.put(`/${repoSeg(repo)}/-/issues/${numSeg(number)}/labels`, { labels });

export const listIssueComments = (repo, number, query) =>
  api.get(`/${repoSeg(repo)}/-/issues/${numSeg(number)}/comments`, query);
export const createIssueComment = (repo, number, body) =>
  api.post(`/${repoSeg(repo)}/-/issues/${numSeg(number)}/comments`, { body });

// ---------- 附件 ----------

const UPLOAD = '/api/upload';
const ASSET = '/api/asset';

const IMAGE_TYPES = /^image\/(png|jpe?g|gif|webp|bmp|svg\+xml|heic|heif)$/i;

/**
 * Issue body 里的附件是 CNB 渲染后的 HTML/Markdown，且图片 src 为
 * 仓库相对路径。私有仓库下直接请求会 401/404，必须改写到附件代理。
 */
function proxiedAsset(rawPath) {
  if (!rawPath) return '';
  // 已是 http(s) 绝对地址的第三方图床不接管
  if (/^https?:\/\//i.test(rawPath)) return rawPath;
  const p = String(rawPath).replace(/^\/+/, '');
  if (!/^[^/]+\/[^/]+\/-\/(imgs|files)\//.test(p)) return rawPath;
  return ASSET + '/' + p;
}

/** 把正文里的附件引用改写成代理地址，返回可直接渲染的 HTML 片段 */
export function renderBodyHtml(body, repo) {
  if (!body) return '';
  let html = String(body);

  // <img src='/-/imgs/...' class='cnb-md-image__upload' />
  html = html.replace(
    /<img\b[^>]*\bsrc=(['"])([^'"]+)\1[^>]*>/gi,
    (m, q, src) => m.replace(src, proxiedAsset(src))
  );

  // [name](/-/files/...)
  html = html.replace(
    /\[([^\]]*)\]\(([^)\s]+)\)/g,
    (m, text, href) => `[${text}](${proxiedAsset(href)})`
  );

  // ![alt](/-/imgs/...)
  html = html.replace(
    /!\[([^\]]*)\]\(([^)\s]+)\)/g,
    (m, alt, src) => `<img alt="${alt}" src="${proxiedAsset(src)}" />`
  );

  // 仓库名占位符，避免正文里手写的 cnb.cool 绝对链接在切换仓库时错位
  return html.replace(/__REPO__/g, repoSeg(repo || ''));
}

/** 从正文里抽出附件列表，用于详情页单独渲染缩略图与下载入口 */
export function extractAssets(body, repo) {
  const out = [];
  const seen = new Set();
  const push = (kind, name, url) => {
    const full = proxiedAsset(url);
    if (!full || seen.has(full)) return;
    seen.add(full);
    out.push({ kind, name, url: full });
  };

  const src = String(body || '');
  for (const m of src.matchAll(/<img\b[^>]*\bsrc=(['"])([^'"]+)\1[^>]*>/gi)) {
    push('image', m[2].split('/').pop(), m[2]);
  }
  for (const m of src.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)) {
    push('image', m[2].split('/').pop(), m[2]);
  }
  for (const m of src.matchAll(/\[([^\]]*)\]\((\/-\/(?:files|imgs)\/[^)\s]+)\)/g)) {
    push('file', m[1] || m[2].split('/').pop(), m[2]);
  }
  return out;
}

/**
 * 上传附件到 Issue。
 *
 * 流程（对应 CNB asset-groups 接口）：
 *   1) 一次带上全部文件名/大小/类型，换取 asset_group_id 与各 upload_url；
 *   2) 对每个 upload_url 发 PUT，body 必须是文件原始字节，不能用 FormData；
 *   3) 把返回的 asset_link 原样拼进 Issue 正文。
 *
 * PUT 走 /api/upload 中转：asset.cnb.cool 的 CORS 只放行 cnb.cool 来源，
 * 部署在其它域名时浏览器无法直连。
 */
export async function uploadIssueAssets(repo, files) {
  const list = Array.from(files || []);
  if (!list.length) return [];

  const meta = list.map((f) => ({
    name: f.name,
    size: f.size,
    content_type: f.type || 'application/octet-stream',
  }));

  const group = await api.post(`/${repoSeg(repo)}/-/issues/asset-groups`, {
    image_assets: meta.filter((m) => IMAGE_TYPES.test(m.content_type)),
    file_assets: meta.filter((m) => !IMAGE_TYPES.test(m.content_type)),
  });

  const pairs = [
    ...(group.image_upload_urls || []).map((u, i) => [u, meta.filter((m) => IMAGE_TYPES.test(m.content_type))[i]]),
    ...(group.file_upload_urls || []).map((u, i) => [u, meta.filter((m) => !IMAGE_TYPES.test(m.content_type))[i]]),
  ];

  const results = [];
  for (const [url, m] of pairs) {
    const file = list.find((f) => f.name === m.name && f.size === m.size);
    if (!file) continue;
    const res = await fetch(
      UPLOAD + '?url=' + encodeURIComponent(url.upload_url),
      {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      }
    );
    if (!res.ok) {
      throw new ApiError(`上传失败：${file.name} (${res.status})`, res.status, null);
    }
    results.push({
      name: url.name,
      asset_link: url.asset_link,
      download_url: url.download_url,
      path: url.path,
      file,
    });
  }
  return results;
}

/** 把上传结果转成可插入 Issue 正文的 Markdown/HTML 片段 */
export function assetsToMarkdown(assets) {
  return assets
    .map((a) => a.asset_link)
    .filter(Boolean)
    .join('\n\n');
}

// ---------- Pull Request ----------

export const listPulls = (repo, query) => api.get(`/${repoSeg(repo)}/-/pulls`, query);
export const getPull = (repo, number) => api.get(`/${repoSeg(repo)}/-/pulls/${numSeg(number)}`);
export const createPull = (repo, body) => api.post(`/${repoSeg(repo)}/-/pulls`, body);
export const patchPull = (repo, number, body) =>
  api.patch(`/${repoSeg(repo)}/-/pulls/${numSeg(number)}`, body);

export const listPullFiles = (repo, number) =>
  api.get(`/${repoSeg(repo)}/-/pulls/${numSeg(number)}/files`);
export const listPullCommits = (repo, number, query) =>
  api.get(`/${repoSeg(repo)}/-/pulls/${numSeg(number)}/commits`, query);
export const listPullReviews = (repo, number, query) =>
  api.get(`/${repoSeg(repo)}/-/pulls/${numSeg(number)}/reviews`, query);
export const listPullComments = (repo, number, query) =>
  api.get(`/${repoSeg(repo)}/-/pulls/${numSeg(number)}/comments`, query);
export const createPullComment = (repo, number, body) =>
  api.post(`/${repoSeg(repo)}/-/pulls/${numSeg(number)}/comments`, { body });

export const putPullLabels = (repo, number, labels) =>
  api.put(`/${repoSeg(repo)}/-/pulls/${numSeg(number)}/labels`, { labels });

export const mergePull = (repo, number, body) =>
  api.put(`/${repoSeg(repo)}/-/pulls/${numSeg(number)}/merge`, body);