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
export const createIssueComment = (repo, number, body, workMode = false) =>
  api.post(`/${repoSeg(repo)}/-/issues/${numSeg(number)}/comments`, {
    body,
    ...workModeBody(workMode),
  });

// ---------- NPC 工作模式 ----------

/**
 * 「替我上班」（NPC 工作模式）在写接口上的字段名是 `work_mode`。
 *
 * 只有这 5 个接口接受该字段（见 CNB OpenAPI）：
 *   POST /{repo}/-/issues                                    创建 Issue
 *   POST /{repo}/-/issues/{number}/comments                   Issue 评论
 *   POST /{repo}/-/pulls/{number}/comments                    PR 评论
 *   POST /{repo}/-/pulls/{number}/reviews                     PR 评审
 *   POST /{repo}/-/pulls/{number}/reviews/{review_id}/replies 评审回复
 * 列表、详情等读接口不回传该字段；`@CodeBuddy` 不提也能跑，只是令牌只读（代码只读、只能评论）。
 * 详见 https://docs.cnb.cool/zh/build/npc.html（工作模式）与
 *     https://docs.cnb.cool/zh/build/npc-integration.html（API 触发时的 `npc.workMode`）
 */
export function workModeBody(workMode) {
  return workMode ? { work_mode: true } : {};
}

// 读接口不回传该字段，前端只能自己记住上次的选择
const WORK_MODE_KEY = 'cnb-manager:work-mode';

/**
 * 默认开启（用户要求「替我上班也默认选中」）。
 * 只有用户手动关过（存了 '0'）才是不选，没存过一律按选中处理。
 */
export function readWorkMode() {
  try {
    return localStorage.getItem(WORK_MODE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function saveWorkMode(on) {
  try {
    localStorage.setItem(WORK_MODE_KEY, on ? '1' : '0');
  } catch {
    // 隐私模式下写不进去，忽略即可
  }
}

// ---------- 附件 ----------

const UPLOAD = '/api/upload';
const ASSET = '/api/asset';

const IMAGE_TYPES = /^image\/(png|jpe?g|gif|webp|bmp|svg\+xml|heic|heif)$/i;

/**
 * Issue/PR 正文与评论里的附件是 CNB 渲染后的 HTML/Markdown。
 * 关键点：CNB 存进正文的路径是**仓库相对路径**，形如
 *   /-/imgs/issues/{group}/{token}/{uuid}.png
 * 不含 `组织/仓库/` 前缀（实测 asset-groups 返回的 asset_link / path 就是这样）。
 * 私有仓库直接请求会 401/404，所以必须补上仓库前缀并改写到附件代理。
 */
// 只有 CNB 自己的附件路径需要改写；第三方图床必须原样放行。
// 用 host 白名单而非「像不像 CNB」，避免把别人的图也塞进我们的令牌代理。
const CNB_ASSET_HOSTS = new Set(['cnb.cool', 'www.cnb.cool', 'api.cnb.cool', 'asset.cnb.cool']);

/** 从绝对 URL 里取出附件路径（org/repo/-/imgs|files/...），非 CNB 附件返回 null */
function assetPathFromAbsoluteUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (!CNB_ASSET_HOSTS.has(u.hostname.toLowerCase())) return null;
  const p = u.pathname.replace(/^\/+/, '');
  return /^[^/]+\/[^/]+\/-\/(imgs|files)\//.test(p) ? p : null;
}

export function proxiedAsset(rawPath, repo) {
  if (!rawPath) return '';
  const raw = String(rawPath);

  // 绝对地址：是 CNB 附件就走代理（私有仓库裸链会 400/401），
  // 其它（第三方图床、外链）保持原样。
  if (/^https?:\/\//i.test(raw)) {
    const abs = assetPathFromAbsoluteUrl(raw);
    return abs ? ASSET + '/' + abs : raw;
  }

  const p = raw.replace(/^\/+/, '');
  // 带 `组织/仓库/-/(imgs|files)/` 前缀的直通
  if (/^[^/]+\/[^/]+\/-\/(imgs|files)\//.test(p)) return ASSET + '/' + p;
  // 仓库相对路径：补上当前仓库前缀
  if (/^-\/(imgs|files)\//.test(p)) {
    // proxiedAsset 在渲染期被调用，这里不能抛异常（会整棵树卸载 → 黑屏）。
    // 拿到非字符串（比如误传了 { path } 对象）就退化为原样返回。
    if (typeof repo !== 'string' || !REPO_RE.test(repo)) return rawPath;
    return ASSET + '/' + repo + '/' + p;
  }
  return rawPath;
}

// 正文里的图片：Markdown ![alt](url) 或 HTML <img src="url">
const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
const HTML_IMAGE_RE = /<img\b[^>]*?\bsrc=(['"])([^'"]+)\1[^>]*>/gi;
// 正文里的普通 Markdown 链接 [text](url)
const MD_LINK_RE = /\[([^\]]*)\]\(([^)\s]+)\)/g;

// 是否为附件路径（仓库相对 /-/imgs|x 或带前缀）
const isAssetUrl = (u) => /(^|\/)-\/(imgs|files)\//.test(String(u));

/**
 * 把正文/评论切成可渲染的片段，按出现顺序返回：
 *   { type: 'text' | 'image' | 'file', ... }
 * 文本片段交给 React 文本节点渲染（天然转义，不引入 XSS 面）。
 */
export function parseBody(body, repo) {
  const src = String(body || '');
  if (!src) return [];

  // 先把 Markdown/HTML 图片标记找出来，统一成占位区间
  const marks = [];
  const collect = (re, build) => {
    for (const m of src.matchAll(re)) {
      marks.push({ start: m.index, end: m.index + m[0].length, ...build(m) });
    }
  };
  collect(HTML_IMAGE_RE, (m) => ({ kind: 'image', url: m[2], alt: '' }));
  collect(MD_IMAGE_RE, (m) => ({ kind: 'image', url: m[2], alt: m[1] }));

  marks.sort((a, b) => a.start - b.start);

  const out = [];
  let cursor = 0;
  for (const mk of marks) {
    if (mk.start < cursor) continue; // 与上一段重叠（HTML img 已覆盖）就跳过
    if (mk.start > cursor) {
      pushText(out, src.slice(cursor, mk.start));
    }
    const url = proxiedAsset(mk.url, repo);
    const name = (mk.alt || String(mk.url).split('/').pop() || '图片').trim();
    out.push({ type: 'image', url, name });
    cursor = mk.end;
  }
  if (cursor < src.length) pushText(out, src.slice(cursor));

  // 文本片段里若还残留 [name](/-/files/...) 附件链接，拆成下载入口
  return out.flatMap((seg) => (seg.type === 'text' ? splitFileLinks(seg.text, repo) : seg));
}

function pushText(out, text) {
  if (!text) return;
  // 与上一段文本合并，避免碎片化
  const last = out[out.length - 1];
  if (last && last.type === 'text') last.text += text;
  else out.push({ type: 'text', text });
}

/** 把文本里的附件链接（非图片）拆成 file 片段，其余仍是文本 */
function splitFileLinks(text, repo) {
  const out = [];
  let cursor = 0;
  for (const m of text.matchAll(MD_LINK_RE)) {
    const [, label, href] = m;
    if (!isAssetUrl(href)) continue;
    if (m.index > cursor) pushText(out, text.slice(cursor, m.index));
    out.push({
      type: 'file',
      name: (label || String(href).split('/').pop() || '附件').trim(),
      url: proxiedAsset(href, repo),
    });
    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) pushText(out, text.slice(cursor));
  return out.length ? out : [{ type: 'text', text }];
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
export const createPullComment = (repo, number, body, workMode = false) =>
  api.post(`/${repoSeg(repo)}/-/pulls/${numSeg(number)}/comments`, {
    body,
    ...workModeBody(workMode),
  });

export const putPullLabels = (repo, number, labels) =>
  api.put(`/${repoSeg(repo)}/-/pulls/${numSeg(number)}/labels`, { labels });

export const mergePull = (repo, number, body) =>
  api.put(`/${repoSeg(repo)}/-/pulls/${numSeg(number)}/merge`, body);