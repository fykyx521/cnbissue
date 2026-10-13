// NPC 名字。评论里 @ 到它才会唤起 NPC 流水线
export const NPC_NAME = 'CodeBuddy';

export const PRIORITIES = [
  { value: '-2P', label: '-2P', tone: 'var(--red)' },
  { value: '-1P', label: '-1P', tone: 'var(--orange)' },
  { value: 'P0', label: 'P0', tone: 'var(--red)' },
  { value: 'P1', label: 'P1', tone: 'var(--orange)' },
  { value: 'P2', label: 'P2', tone: 'var(--accent)' },
  { value: 'P3', label: 'P3', tone: 'var(--fg-dim)' },
];

export const PRIORITY_TONE = Object.fromEntries(PRIORITIES.map((p) => [p.value, p.tone]));

export const ISSUE_STATES = [
  { value: 'open', label: '进行中' },
  { value: 'closed', label: '已关闭' },
  { value: '', label: '全部' },
];

export const PULL_STATES = [
  { value: 'open', label: '待合并' },
  { value: 'closed', label: '已关闭' },
  { value: 'all', label: '全部' },
];

export const CLOSE_REASONS = [
  { value: 'completed', label: '已完成' },
  { value: 'not_planned', label: '不计划处理' },
];

export const STATE_REASON_LABEL = {
  open: '进行中',
  completed: '已完成',
  not_planned: '不计划处理',
  reopened: '已重新打开',
};

export const MERGE_STYLES = [
  {
    value: 'squash',
    label: 'Squash 压缩',
    hint: '将多个提交压缩为一个提交后合入',
    default: true,
  },
  { value: 'merge', label: 'Merge 合并', hint: '保留一个合并提交及全部特性提交' },
  { value: 'rebase', label: 'Rebase 变基', hint: '把特性提交逐个变基到目标分支，无合并提交' },
];

export const MERGEABLE_STATE = {
  checking: { label: '检查中', tone: 'badge-checking', ico: '⟳' },
  mergeable: { label: '可合并', tone: 'badge-mergeable', ico: '✓' },
  merging: { label: '合并中', tone: 'badge-checking', ico: '⟳' },
  merged: { label: '已合并', tone: 'badge-merged', ico: '✓' },
  conflict: { label: '有冲突', tone: 'badge-conflict', ico: '✕' },
  'no-merge-base': { label: '无共同基点', tone: 'badge-conflict', ico: '✕' },
};

export const BLOCKED_REASON = {
  no_merge_base: '不存在共同基点，无法合并',
  internal_error: 'CNB 内部错误',
  code_conflict: '存在代码冲突',
  status_check: 'CI 检查未通过',
  waiting_review: '等待评审通过',
};

export const FILE_STATUS = {
  add: '新增',
  modify: '修改',
  delete: '删除',
  rename: '重命名',
  copy: '复制',
};

export const REVIEW_STATE_LABEL = {
  approved: '已通过',
  changes_requested: '需修改',
  commented: '已评论',
  dismissed: '已忽略',
  pending: '待评审',
};

export const REVIEW_STATE_TONE = {
  approved: 'badge-open',
  changes_requested: 'badge-conflict',
  commented: 'badge-accent',
  dismissed: 'badge-neutral',
  pending: 'badge-checking',
};

export function shortRef(ref = '') {
  return String(ref).replace(/^refs\/heads\//, '');
}

export function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前`;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

export function repoPathOf(repo) {
  if (typeof repo === 'string') return repo;
  return repo?.path || `${repo?.name || ''}`;
}

export function shortSha(sha = '') {
  return String(sha).slice(0, 7);
}
// ---------- 流水线构建 ----------

/**
 * 构建 / stage 状态。上游取值固定为下面这几种：
 *   pending 等待中、success 成功、error 失败、cancel 已取消，
 *   stage 额外有 start（进行中）与 skip（跳过）。
 * 映射表里没有的一律退化成灰色 badge，不抛异常。
 */
export const BUILD_STATUS = {
  pending: { label: '等待中', tone: 'badge-checking', ico: '⟳' },
  start: { label: '进行中', tone: 'badge-accent', ico: '⟳' },
  running: { label: '进行中', tone: 'badge-accent', ico: '⟳' },
  success: { label: '成功', tone: 'badge-open', ico: '✓' },
  error: { label: '失败', tone: 'badge-conflict', ico: '✕' },
  failed: { label: '失败', tone: 'badge-conflict', ico: '✕' },
  cancel: { label: '已取消', tone: 'badge-neutral', ico: '⊘' },
  cancelled: { label: '已取消', tone: 'badge-neutral', ico: '⊘' },
  skip: { label: '已跳过', tone: 'badge-neutral', ico: '→' },
  skipped: { label: '已跳过', tone: 'badge-neutral', ico: '→' },
};

/** 构建列表的状态筛选项。空串表示不筛 */
export const BUILD_STATES = [
  { value: '', label: '全部' },
  { value: 'pending', label: '等待中' },
  { value: 'success', label: '成功' },
  { value: 'error', label: '失败' },
  { value: 'cancel', label: '已取消' },
];

export function buildStatusOf(status) {
  return BUILD_STATUS[String(status || '').toLowerCase()] || {
    label: status || '未知',
    tone: 'badge-neutral',
    ico: '•',
  };
}

/** 构建是否还在跑（用于决定要不要轮询、能不能停止） */
export function isBuildActive(status) {
  const s = String(status || '').toLowerCase();
  return s === 'pending' || s === 'start' || s === 'running';
}

/** 毫秒时长 → 「3.2s」「1m20s」「2h3m」这类紧凑写法 */
export function formatDuration(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const s = n / 1000;
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${Math.round(s % 60)}s`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60}m`;
}
