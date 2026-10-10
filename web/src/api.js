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