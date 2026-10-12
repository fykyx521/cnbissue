import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  createIssueComment,
  extractAssets,
  getIssue,
  getIssueLabels,
  listIssueComments,
  patchIssue,
  putIssueLabels,
  saveWorkMode,
} from '../api.js';
import { CLOSE_REASONS, PRIORITIES, PRIORITY_TONE, STATE_REASON_LABEL, formatTime } from '../constants.js';
import { Dialog } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { StateBadge, UserTag } from '../components/cards.jsx';
import AssetPicker from '../components/AssetPicker.jsx';
import WorkModeToggle from '../components/WorkModeToggle.jsx';
import AssetList from '../components/AssetList.jsx';
import { useRepo } from '../App.jsx';

export default function IssueDetail() {
  const { number } = useParams();
  const { repo } = useRepo();
  const nav = useNavigate();
  const toast = useToast();
  const repoPath = repo?.path;

  const [issue, setIssue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [comments, setComments] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [reason, setReason] = useState('completed');
  const [labelOpen, setLabelOpen] = useState(false);
  const [labelInput, setLabelInput] = useState('');
  const [labels, setLabels] = useState([]);
  const [busy, setBusy] = useState(false);
  const [workMode, setWorkMode] = useState(false);

  const load = useCallback(async () => {
    if (!repoPath) return;
    setLoading(true);
    setError('');
    try {
      const d = await getIssue(repoPath, number);
      setIssue(d);
    } catch (e) {
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [repoPath, number]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!repoPath) return;
    listIssueComments(repoPath, number, { page: 1, page_size: 50, sort: 'created' })
      .then((c) => setComments(Array.isArray(c) ? c : []))
      .catch(() => setComments([]));
  }, [repoPath, number]);

  const openLabelEditor = async () => {
    setLabelOpen(true);
    setLabelInput('');
    try {
      const list = await getIssueLabels(repoPath, number);
      const names = (Array.isArray(list) ? list : []).map((l) => l.name || l);
      setLabels(names.filter(Boolean));
    } catch {
      setLabels((issue?.labels || []).map((l) => l.name));
    }
  };

  const submitLabels = async () => {
    const next = labelInput
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    setBusy(true);
    try {
      await putIssueLabels(repoPath, number, next);
      setLabelOpen(false);
      toast('标签已更新', 'ok');
      load();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const doClose = async () => {
    setBusy(true);
    try {
      // state 与 state_reason 必须成对提交
      await patchIssue(repoPath, number, { state: 'closed', state_reason: reason });
      setCloseOpen(false);
      toast('Issue 已关闭', 'ok');
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
      await patchIssue(repoPath, number, { state: 'open', state_reason: 'reopened' });
      toast('Issue 已重新打开', 'ok');
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
      await createIssueComment(repoPath, number, body, workMode);
      setDraft('');
      // 工作模式只对当前这一条评论生效，避免下一条误开
      setWorkMode(false);
      saveWorkMode(false);
      const c = await listIssueComments(repoPath, number, {
        page: 1,
        page_size: 50,
        sort: 'created',
      });
      setComments(Array.isArray(c) ? c : []);
      toast('评论已发布', 'ok');
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setSending(false);
    }
  };

  if (!repoPath) return <div className="center-note">请先选择仓库</div>;
  if (loading) return <div className="center-note" style={{ paddingTop: 60 }}>加载中…</div>;
  if (error) return <div className="error-box">{error}</div>;
  if (!issue) return null;

  const closed = issue.state === 'closed';
  const tone = PRIORITY_TONE[issue.priority];

  return (
    <>
      <div className="appbar-row" style={{ borderBottom: '1px solid var(--line-soft)' }}>
        <button className="iconbtn" onClick={() => nav(-1)} aria-label="返回">
          ‹
        </button>
        <div className="appbar-title">#{issue.number}</div>
        <button className="iconbtn" onClick={() => nav(`/issues/${number}/edit`)}>
          编辑
        </button>
      </div>

      <div className="detail-section">
        <div className={`detail-title ${closed ? 'closed' : ''}`}>{issue.title}</div>
        <div className="detail-sub">
          <StateBadge state={issue.state} />
          {closed && issue.state_reason && (
            <span className="tag">
              {STATE_REASON_LABEL[issue.state_reason] || issue.state_reason}
            </span>
          )}
          {issue.priority && tone && (
            <span className="tag" style={{ color: tone, borderColor: 'transparent' }}>
              {issue.priority}
            </span>
          )}
          <span className="mono">更新于 {formatTime(issue.updated_at)}</span>
        </div>
        <div className="md-body">{issue.body || ''}</div>
        <AssetList body={issue.body} />
        <div className="section-head">
          <span>元信息</span>
        </div>
        <div className="kv">
          <span className="k">作者</span>
          <span className="v">
            <UserTag user={issue.author} />
          </span>
        </div>
        <div className="kv">
          <span className="k">创建</span>
          <span className="v">{formatTime(issue.created_at)}</span>
        </div>
        {issue.started_at && (
          <div className="kv">
            <span className="k">开始</span>
            <span className="v">{issue.started_at}</span>
          </div>
        )}
        {issue.ended_at && (
          <div className="kv">
            <span className="k">结束</span>
            <span className="v">{issue.ended_at}</span>
          </div>
        )}
        <div className="kv">
          <span className="k">处理人</span>
          <span className="v">
            {(issue.assignees || []).length ? (
              issue.assignees.map((u) => <UserTag key={u.username} user={u} />)
            ) : (
              <span style={{ color: 'var(--fg-faint)' }}>未分配</span>
            )}
          </span>
        </div>
        <div className="kv">
          <span className="k">标签</span>
          <span className="v" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(issue.labels || []).map((l) => (
              <span
                key={l.id || l.name}
                className="tag dot"
                style={l.color ? { color: l.color, borderColor: 'transparent' } : undefined}
              >
                {l.name}
              </span>
            ))}
            <button className="btn btn-sm" onClick={openLabelEditor}>
              管理
            </button>
          </span>
        </div>
      </div>

      <div className="btn-row" style={{ marginTop: 12 }}>
        {closed ? (
          <button className="btn btn-primary" onClick={doReopen} disabled={busy}>
            重新打开
          </button>
        ) : (
          <button className="btn btn-success" onClick={() => setCloseOpen(true)} disabled={busy}>
            关闭 Issue
          </button>
        )}
      </div>

      <div className="detail-section" style={{ marginTop: 12 }}>
        <div className="section-head">
          <span>评论 {comments.length}</span>
        </div>
        {comments.length === 0 && <div className="center-note">还没有评论</div>}
        {comments.map((c) => (
          <div key={c.id || c.created_at} className="listrow">
            <div className="grow">
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
                <UserTag user={c.author || c.user} />
                <span className="mono">{formatTime(c.created_at)}</span>
              </div>
              <div style={{ whiteSpace: 'pre-wrap', color: 'var(--fg-dim)' }}>{c.body}</div>
              <AssetList body={c.body} />
            </div>
          </div>
        ))}
        <div style={{ padding: 12 }}>
          <textarea
            className="field"
            style={{ width: '100%', minHeight: 88, background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 11, padding: 11, outline: 'none' }}
            placeholder="写下你的评论…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
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
      </div>

      {closeOpen && (
        <Dialog
          title="关闭 Issue"
          confirmText="确认关闭"
          tone="success"
          onCancel={() => setCloseOpen(false)}
          onConfirm={doClose}
        >
          <div style={{ marginBottom: 12 }}>请选择关闭原因：</div>
          <div className="chipset">
            {CLOSE_REASONS.map((r) => (
              <button
                key={r.value}
                className={`chip ${reason === r.value ? 'on' : ''}`}
                onClick={() => setReason(r.value)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </Dialog>
      )}

      {labelOpen && (
        <Dialog
          title="管理标签"
          confirmText={busy ? '保存中…' : '保存'}
          onCancel={() => setLabelOpen(false)}
          onConfirm={submitLabels}
        >
          <div style={{ marginBottom: 10, color: 'var(--fg-dim)', fontSize: 13 }}>
            当前：{labels.length ? labels.join('、') : '无'}
          </div>
          <input
            className="field"
            style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 11, padding: 11, outline: 'none' }}
            placeholder="用空格或逗号分隔，如：bug feature"
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
          />
          <div className="hint" style={{ marginTop: 6, color: 'var(--fg-faint)', fontSize: 11.5 }}>
            保存后将覆盖现有标签（最多 10 个）
          </div>
        </Dialog>
      )}
    </>
  );
}