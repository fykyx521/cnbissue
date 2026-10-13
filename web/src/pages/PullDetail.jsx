import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  createPullComment,
  getPull,
  listPullComments,
  listPullCommits,
  listPullFiles,
  listPullReviews,
  patchPull,
} from '../api.js';
import {
  BLOCKED_REASON,
  FILE_STATUS,
  MERGEABLE_STATE,
  REVIEW_STATE_LABEL,
  REVIEW_STATE_TONE,
  formatTime,
  shortRef,
  shortSha,
} from '../constants.js';
import { Dialog, Empty } from '../components/ui.jsx';
import AssetPicker from '../components/AssetPicker.jsx';
import LazyTabs from '../components/LazyTabs.jsx';
import MergeSheet from '../components/MergeSheet.jsx';
import MarkdownBody from '../components/MarkdownBody.jsx';
import WorkModeToggle from '../components/WorkModeToggle.jsx';
import CommentShortcuts from '../components/CommentShortcuts.jsx';
import { useToast } from '../components/Toast.jsx';
import { UserTag } from '../components/cards.jsx';
import { useRepo } from '../App.jsx';

export default function PullDetail() {
  const { number } = useParams();
  const { repo } = useRepo();
  const nav = useNavigate();
  const toast = useToast();
  const repoPath = repo?.path;

  const [pull, setPull] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mergeOpen, setMergeOpen] = useState(false);
  const [closeAsk, setCloseAsk] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [comments, setComments] = useState([]);
  // 默认选中「替我上班」，挂载后由 WorkModeToggle 用本地选择覆盖
  const [workMode, setWorkMode] = useState(true);

  const load = useCallback(async () => {
    if (!repoPath) return;
    setLoading(true);
    setError('');
    try {
      setPull(await getPull(repoPath, number));
    } catch (e) {
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [repoPath, number]);

  useEffect(() => {
    load();
  }, [load]);

  // mergeable_state 为 checking 时轮询
  useEffect(() => {
    if (pull?.mergeable_state !== 'checking') return;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [pull?.mergeable_state, load]);

  useEffect(() => {
    if (!repoPath) return;
    listPullComments(repoPath, number, { page: 1, page_size: 50 })
      .then((c) => setComments(Array.isArray(c) ? c : []))
      .catch(() => setComments([]));
  }, [repoPath, number, pull]);

  const doClose = async () => {
    setBusy(true);
    try {
      await patchPull(repoPath, number, { state: 'closed' });
      setCloseAsk(false);
      toast('PR 已关闭', 'ok');
      load();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const doReopen = async () => {
    setBusy(true);
    try {
      await patchPull(repoPath, number, { state: 'open' });
      toast('PR 已重新打开', 'ok');
      load();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const doComment = async () => {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      await createPullComment(repoPath, number, body, workMode);
      setDraft('');
      const c = await listPullComments(repoPath, number, { page: 1, page_size: 50 });
      setComments(Array.isArray(c) ? c : []);
      toast('评论已发布', 'ok');
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setSending(false);
    }
  };

  const tabs = [
    {
      key: 'files',
      label: '变更文件',
      loader: () => listPullFiles(repoPath, number),
      render: (data) => {
        const list = Array.isArray(data) ? data : [];
        if (!list.length) return <Empty ico="📄" text="没有变更文件" />;
        return list.map((f, i) => (
          <div key={f.sha || f.filename || i} className="listrow">
            <div className="grow">
              <div className="mono" style={{ color: 'var(--fg-dim)' }}>
                {f.filename || f.path || f.name}
              </div>
              <div style={{ marginTop: 3, fontSize: 12 }}>
                <span style={{ color: 'var(--green)' }}>+{f.additions ?? 0}</span>
                {'  '}
                <span style={{ color: 'var(--red)' }}>-{f.deletions ?? 0}</span>
                {f.status ? (
                  <span className="mono" style={{ marginLeft: 8 }}>
                    {FILE_STATUS[f.status] || f.status}
                  </span>
                ) : null}
              </div>
              {f.patch && (
                <pre
                  className="mono"
                  style={{
                    margin: '6px 0 0',
                    padding: 8,
                    background: 'var(--bg)',
                    borderRadius: 8,
                    maxHeight: 190,
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: 11,
                    lineHeight: 1.45,
                  }}
                >
                  {f.patch}
                </pre>
              )}
            </div>
          </div>
        ));
      },
    },
    {
      key: 'commits',
      label: '提交',
      loader: () => listPullCommits(repoPath, number, { page: 1, page_size: 50 }),
      render: (data) => {
        const list = Array.isArray(data) ? data : [];
        if (!list.length) return <Empty ico="✍️" text="没有提交" />;
        return list.map((c) => {
          // 实际结构：{ sha, commit: { message, author: {name,email,date} }, author }
          const msg = c.commit?.message || c.message || '';
          const author = c.author || c.committer;
          const rawAuthor = c.commit?.author;
          const name = author
            ? author.nickname || author.username || rawAuthor?.name
            : rawAuthor?.name;
          const when = c.created_at || rawAuthor?.date;
          return (
            <div key={c.sha || c.id} className="listrow">
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{msg.split('\n')[0]}</div>
                <div className="mono" style={{ marginTop: 3 }}>
                  {shortSha(c.sha || c.id)}
                  {name ? ` · ${name}` : ''}
                  {when ? ` · ${formatTime(when)}` : ''}
                </div>
              </div>
            </div>
          );
        });
      },
    },
    {
      key: 'reviews',
      label: '评审',
      loader: () => listPullReviews(repoPath, number, { page: 1, page_size: 50 }),
      render: (data) => {
        const list = Array.isArray(data) ? data : [];
        if (!list.length) return <Empty ico="👀" text="还没有评审记录" />;
        return list.map((r) => (
          <div key={r.id || r.created_at} className="listrow">
            <div className="grow">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <UserTag user={r.author || r.user || r.reviewer} />
                <span className={`tag ${REVIEW_STATE_TONE[r.state] || 'badge-neutral'}`}>
                  {REVIEW_STATE_LABEL[r.state] || r.state || 'pending'}
                </span>
              </div>
              {r.body && (
                <div style={{ marginTop: 4, color: 'var(--fg-dim)', whiteSpace: 'pre-wrap' }}>
                  {r.body}
                </div>
              )}
              <div className="mono" style={{ marginTop: 3 }}>
                {formatTime(r.submitted_at || r.created_at)}
              </div>
            </div>
          </div>
        ));
      },
    },
    {
      key: 'discussion',
      label: `讨论${comments.length ? ` ${comments.length}` : ''}`,
      loader: () => listPullComments(repoPath, number, { page: 1, page_size: 50 }),
      render: (data) => {
        const list = Array.isArray(data) ? data : [];
        return (
          <>
            {list.length === 0 && <Empty ico="💬" text="还没有评论" />}
            {list.map((c) => (
              <div key={c.id || c.created_at} className="listrow">
                <div className="grow">
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <UserTag user={c.author || c.user} />
                    <span className="mono">{formatTime(c.created_at)}</span>
                  </div>
                  <MarkdownBody body={c.body} className="md-comment" />
                </div>
              </div>
            ))}
            <div style={{ padding: 12 }}>
              <textarea
                className="field"
                style={{
                  width: '100%',
                  minHeight: 80,
                  background: 'var(--bg)',
                  border: '1px solid var(--line)',
                  borderRadius: 11,
                  padding: 11,
                  outline: 'none',
                }}
                placeholder="写下你的评论…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <div style={{ marginTop: 8 }}>
                <CommentShortcuts value={draft} onChange={setDraft} disabled={sending} />
              </div>
              <div style={{ marginTop: 8 }}>
                <AssetPicker value={draft} onChange={setDraft} disabled={sending} compact />
              </div>
              <div style={{ marginTop: 8 }}>
                <WorkModeToggle value={workMode} onChange={setWorkMode} disabled={sending} />
              </div>
              <button
                className="btn btn-primary btn-block"
                style={{ marginTop: 10 }}
                onClick={doComment}
                disabled={sending || !draft.trim()}
              >
                {sending ? '发布中…' : '发表评论'}
              </button>
            </div>
          </>
        );
      },
    },
  ];

  if (!repoPath) return <div className="center-note">请先选择仓库</div>;
  if (loading && !pull) return <div className="center-note" style={{ paddingTop: 60 }}>加载中…</div>;
  if (error && !pull) return <div className="error-box">{error}</div>;
  if (!pull) return null;

  const merged = pull.is_merged || pull.state === 'merged';
  const ms = MERGEABLE_STATE[pull.mergeable_state];
  const mergeDisabled =
    merged || pull.state === 'closed' || pull.mergeable_state !== 'mergeable';
  const blockedText = pull.blocked_on ? BLOCKED_REASON[pull.blocked_on] : '';

  return (
    <>
      <div className="appbar-row" style={{ borderBottom: '1px solid var(--line-soft)' }}>
        <button className="iconbtn" onClick={() => nav(-1)} aria-label="返回">
          ‹
        </button>
        <div className="appbar-title">#{pull.number}</div>
        <button className="iconbtn" onClick={() => nav(`/pulls/${number}/edit`)}>
          编辑
        </button>
      </div>

      <div className="detail-section">
        <div className={`detail-title ${merged || pull.state === 'closed' ? 'closed' : ''}`}>
          {pull.title}
        </div>
        <div className="detail-sub">
          {merged ? (
            <span className="tag badge-merged dot">已合并</span>
          ) : pull.state === 'closed' ? (
            <span className="tag badge-closed dot">已关闭</span>
          ) : (
            ms && <span className={`tag ${ms.tone} dot`}>{ms.label}</span>
          )}
          {pull.is_wip && <span className="tag badge-wip">草稿 WIP</span>}
          {pull.is_force_merged && <span className="tag badge-checking">强制合并</span>}
          {!merged && pull.blocked_on && blockedText && (
            <span className="tag badge-conflict dot">{blockedText}</span>
          )}
        </div>

        <div className="branchline" style={{ padding: '0 14px 4px' }}>
          <span>{shortRef(pull.head?.ref)}</span>
          <span className="arrow">→</span>
          <span>{shortRef(pull.base?.ref)}</span>
        </div>

        <MarkdownBody body={pull.body} />

        <div className="section-head">
          <span>元信息</span>
        </div>
        <div className="kv">
          <span className="k">作者</span>
          <span className="v">
            <UserTag user={pull.author} />
          </span>
        </div>
        <div className="kv">
          <span className="k">创建</span>
          <span className="v">{formatTime(pull.created_at)}</span>
        </div>
        <div className="kv">
          <span className="k">源分支</span>
          <span className="v mono">
            {shortRef(pull.head?.ref)}@{shortSha(pull.head?.sha)}
          </span>
        </div>
        <div className="kv">
          <span className="k">目标分支</span>
          <span className="v mono">
            {shortRef(pull.base?.ref)}@{shortSha(pull.base?.sha)}
          </span>
        </div>
        {merged && (
          <div className="kv">
            <span className="k">合并者</span>
            <span className="v">
              <UserTag user={pull.merged_by} />
            </span>
          </div>
        )}
        <div className="kv">
          <span className="k">评审人</span>
          <span className="v">
            {(pull.reviewers || []).length ? (
              pull.reviewers.map((r) => (
                <div key={r.user?.username || r.user?.nickname} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <UserTag user={r.user} />
                  <span className="mono">{r.review_state}</span>
                </div>
              ))
            ) : (
              <span style={{ color: 'var(--fg-faint)' }}>未指定</span>
            )}
          </span>
        </div>
      </div>

      <div className="btn-row" style={{ marginTop: 12 }}>
        {merged ? (
          <button className="btn" disabled>
            已合并
          </button>
        ) : (
          <>
            <button
              className="btn btn-success"
              disabled={mergeDisabled}
              onClick={() => setMergeOpen(true)}
            >
              {mergeDisabled && pull.mergeable_state === 'checking' ? '检查中…' : '合并'}
            </button>
            {pull.state === 'closed' ? (
              <button className="btn btn-primary" onClick={doReopen} disabled={busy}>
                重新打开
              </button>
            ) : (
              <button className="btn btn-danger" onClick={() => setCloseAsk(true)} disabled={busy}>
                关闭
              </button>
            )}
          </>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <LazyTabs items={tabs} />
      </div>

      {mergeOpen && (
        <MergeSheet
          repo={repoPath}
          pull={pull}
          onClose={() => setMergeOpen(false)}
          onMerged={() => load()}
        />
      )}

      {closeAsk && (
        <Dialog
          title="关闭 PR"
          confirmText="确认关闭"
          tone="danger"
          onCancel={() => setCloseAsk(false)}
          onConfirm={doClose}
        >
          关闭后该 PR 将不再出现在待合并列表中，确定吗？
        </Dialog>
      )}
    </>
  );
}