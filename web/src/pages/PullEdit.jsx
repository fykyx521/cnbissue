import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createPull, getPull, patchPull } from '../api.js';
import AssetPicker from '../components/AssetPicker.jsx';
import CommentShortcuts from '../components/CommentShortcuts.jsx';
import WorkModeToggle from '../components/WorkModeToggle.jsx';
import { useToast } from '../components/Toast.jsx';
import { useRepo } from '../App.jsx';

export default function PullEdit() {
  const { number } = useParams();
  const isEdit = !!number;
  const { repo } = useRepo();
  const nav = useNavigate();
  const toast = useToast();
  const repoPath = repo?.path;

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [head, setHead] = useState('');
  const [base, setBase] = useState('');
  const [headRepo, setHeadRepo] = useState('');
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  // 描述同样是「写给 CodeBuddy 的活」，所以编辑页也带召唤与工作模式
  const [workMode, setWorkMode] = useState(true);

  useEffect(() => {
    if (!isEdit || !repoPath) return;
    getPull(repoPath, number)
      .then((d) => {
        setTitle(d.title || '');
        setBody(d.body || '');
        setHead((d.head?.ref || '').replace(/^refs\/heads\//, ''));
        setBase((d.base?.ref || '').replace(/^refs\/heads\//, ''));
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [isEdit, repoPath, number]);

  const submit = async () => {
    if (!title.trim()) return setErr('请填写标题');
    if (!isEdit && (!head.trim() || !base.trim())) return setErr('请填写源分支和目标分支');
    setSaving(true);
    setErr('');
    try {
      if (isEdit) {
        await patchPull(repoPath, number, { title: title.trim(), body });
        toast('已保存', 'ok');
        nav(`/pulls/${number}`, { replace: true });
      } else {
        const created = await createPull(repoPath, {
          title: title.trim(),
          body,
          head: head.trim(),
          base: base.trim(),
          head_repo: headRepo.trim() || undefined,
        });
        toast('PR 已创建', 'ok');
        nav(`/pulls/${created.number}`, { replace: true });
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
        <div className="appbar-title">{isEdit ? `编辑 #${number}` : '新建 PR'}</div>
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
            placeholder="简要描述这次变更"
          />
        </div>

        {!isEdit && (
          <>
            <div className="field">
              <label>源分支 *</label>
              <input
                type="text"
                value={head}
                onChange={(e) => setHead(e.target.value)}
                placeholder="feature/my-change"
              />
            </div>
            <div className="field">
              <label>目标分支 *</label>
              <input
                type="text"
                value={base}
                onChange={(e) => setBase(e.target.value)}
                placeholder="main"
              />
            </div>
            <div className="field">
              <label>源仓库（跨仓库 PR 时填写）</label>
              <input
                type="text"
                value={headRepo}
                onChange={(e) => setHeadRepo(e.target.value)}
                placeholder="owner/repo"
              />
            </div>
          </>
        )}

        <div className="field">
          <label>描述</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="变更说明、关联 Issue 等"
          />
          <div style={{ marginTop: 8 }}>
            <CommentShortcuts value={body} onChange={setBody} disabled={saving} />
          </div>
          <div style={{ marginTop: 8 }}>
            <AssetPicker value={body} onChange={setBody} disabled={saving} />
          </div>
          <div style={{ marginTop: 8 }}>
            <WorkModeToggle value={workMode} onChange={setWorkMode} disabled={saving} />
          </div>
        </div>

        {err && <div className="error-box">{err}</div>}

        <div className="field">
          <button className="btn btn-primary btn-block" onClick={submit} disabled={saving}>
            {saving ? '保存中…' : isEdit ? '保存修改' : '创建 PR'}
          </button>
        </div>
      </div>
    </>
  );
}