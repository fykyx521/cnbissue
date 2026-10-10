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