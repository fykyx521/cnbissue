import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listBranches, startWorkspace } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { useRepo } from '../App.jsx';

/**
 * 启动云原生开发环境。
 *
 * 只能针对**当前选中的仓库**启动（启动接口挂在仓库下），
 * 分支留空则用仓库默认分支。已存在环境时接口会直接返回 WebIDE 地址，
 * 否则返回新建流水线的日志地址，两种情况都开新页签打开。
 */
export default function WorkspaceNew() {
  const { repo } = useRepo();
  const nav = useNavigate();
  const toast = useToast();
  const repoPath = repo?.path;

  const [branches, setBranches] = useState([]);
  const [branch, setBranch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!repoPath) return;
    listBranches(repoPath, { page: 1, page_size: 100 })
      .then((list) => {
        const arr = Array.isArray(list) ? list : [];
        setBranches(arr);
        // 默认选中 main / master，否则用第一个
        const preferred = arr.find((b) => b.name === 'main') || arr.find((b) => b.name === 'master');
        setBranch((preferred || arr[0])?.name || '');
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [repoPath]);

  const submit = async () => {
    setSaving(true);
    setErr('');
    try {
      const res = await startWorkspace(repoPath, branch ? { branch } : {});
      if (res?.url) window.open(res.url, '_blank', 'noopener');
      toast(res?.message || '已发起启动，正在打开…', 'ok');
      nav('/workspaces', { replace: true });
    } catch (e) {
      setErr(e.message || '启动失败');
      setSaving(false);
    }
  };

  if (!repoPath) return <div className="center-note">请先选择仓库</div>;

  return (
    <>
      <div className="appbar-row" style={{ borderBottom: '1px solid var(--line-soft)' }}>
        <button className="iconbtn" onClick={() => nav(-1)} aria-label="返回">
          ‹
        </button>
        <div className="appbar-title">启动云原生开发</div>
        <button
          className="iconbtn"
          style={{ color: 'var(--accent)' }}
          onClick={submit}
          disabled={saving || loading}
        >
          {saving ? '启动中' : '启动'}
        </button>
      </div>

      <div style={{ paddingTop: 12 }}>
        <div className="field">
          <label>仓库</label>
          <input type="text" value={repoPath} readOnly />
        </div>

        <div className="field">
          <label>分支 / Tag</label>
          <select
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            disabled={loading || !!err}
          >
            {branches.length === 0 && <option value="">（使用仓库默认分支）</option>}
            {branches.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>
          <div className="hint">
            以选定分支为起点创建环境；已存在同分支环境时会直接打开，不会重复创建。
          </div>
        </div>

        {err && <div className="error-box">{err}</div>}
      </div>
    </>
  );
}
