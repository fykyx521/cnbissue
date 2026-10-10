import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createIssue, getIssue, patchIssue } from '../api.js';
import { PRIORITIES } from '../constants.js';
import { useToast } from '../components/Toast.jsx';
import { useRepo } from '../App.jsx';

export default function IssueEdit() {
  const { number } = useParams();
  const isEdit = !!number;
  const { repo } = useRepo();
  const nav = useNavigate();
  const toast = useToast();
  const repoPath = repo?.path;

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState('');
  const [labels, setLabels] = useState('');
  const [assignees, setAssignees] = useState('');
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!isEdit || !repoPath) return;
    getIssue(repoPath, number)
      .then((d) => {
        setTitle(d.title || '');
        setBody(d.body || '');
        setPriority(d.priority || '');
        setLabels((d.labels || []).map((l) => l.name).join(' '));
        setAssignees((d.assignees || []).map((a) => a.username).join(' '));
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [isEdit, repoPath, number]);

  const submit = async () => {
    if (title.trim().length < 2) {
      setErr('标题至少 2 个字符');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      if (isEdit) {
        await patchIssue(repoPath, number, { title: title.trim(), body, priority: priority || undefined });
        toast('已保存', 'ok');
        nav(`/issues/${number}`, { replace: true });
      } else {
        const created = await createIssue(repoPath, {
          title: title.trim(),
          body,
          priority: priority || undefined,
          labels: labels.split(/[\s,，]+/).filter(Boolean),
          assignees: assignees.split(/[\s,，]+/).filter(Boolean),
        });
        toast('Issue 已创建', 'ok');
        nav(`/issues/${created.number}`, { replace: true });
      }
    } catch (e) {
      setErr(e.message || '保存失败');
      setSaving(false);
    }
  };

  if (!repoPath) return <div className="center-note">请先选择仓库</div>;
  if (loading) return <div className="center-note" style={{ paddingTop: 60 }}>加载中…</div>;

  return (
    <>
      <div className="appbar-row" style={{ borderBottom: '1px solid var(--line-soft)' }}>
        <button className="iconbtn" onClick={() => nav(-1)} aria-label="返回">
          ‹
        </button>
        <div className="appbar-title">{isEdit ? `编辑 #${number}` : '新建 Issue'}</div>
        <button className="iconbtn" style={{ color: 'var(--accent)' }} onClick={submit} disabled={saving}>
          {saving ? '保存中' : '保存'}
        </button>
      </div>

      <div style={{ paddingTop: 12 }}>
        <div className="field">
          <label>标题 *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="简要描述问题或需求"
            maxLength={255}
          />
        </div>

        <div className="field">
          <label>描述</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="补充复现步骤、期望结果等"
          />
        </div>

        <div className="field">
          <label>优先级</label>
          <div className="chipset">
            {PRIORITIES.map((p) => (
              <button
                key={p.value}
                className={`chip pri ${priority === p.value ? 'on' : ''}`}
                onClick={() => setPriority(priority === p.value ? '' : p.value)}
                style={priority === p.value ? undefined : { color: p.tone }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {!isEdit && (
          <>
            <div className="field">
              <label>标签（空格分隔，最多 10 个）</label>
              <input
                type="text"
                value={labels}
                onChange={(e) => setLabels(e.target.value)}
                placeholder="bug feature"
              />
            </div>
            <div className="field">
              <label>处理人（用户名，空格分隔，最多 8 个）</label>
              <input
                type="text"
                value={assignees}
                onChange={(e) => setAssignees(e.target.value)}
                placeholder="username1 username2"
              />
            </div>
          </>
        )}

        {err && <div className="error-box">{err}</div>}

        <div className="field">
          <button className="btn btn-primary btn-block" onClick={submit} disabled={saving}>
            {saving ? '保存中…' : isEdit ? '保存修改' : '创建 Issue'}
          </button>
        </div>
      </div>
    </>
  );
}