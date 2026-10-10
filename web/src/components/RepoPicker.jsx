import { useEffect, useMemo, useState } from 'react';
import { BottomSheet } from './ui.jsx';

const REPO_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

export default function RepoPicker({ repos, loading, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [kw, setKw] = useState('');
  const [manual, setManual] = useState('');
  const [manualErr, setManualErr] = useState('');

  const filtered = useMemo(() => {
    const q = kw.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter((r) => (r.path || r.name || '').toLowerCase().includes(q));
  }, [repos, kw]);

  useEffect(() => {
    if (!open) {
      setKw('');
      setManual('');
      setManualErr('');
    }
  }, [open]);

  const submitManual = () => {
    const v = manual.trim();
    if (!REPO_RE.test(v)) {
      setManualErr('请输入 组织/仓库 形式，例如 i0358/issue');
      return;
    }
    onChange({ path: v, name: v.split('/')[1] });
    setOpen(false);
  };

  return (
    <>
      <div className="repopicker">
        <button className="repopicker-btn" onClick={() => setOpen(true)} disabled={loading}>
          <span className="rp-label">仓库</span>
          <span className="rp-name">
            {loading ? '加载中…' : value ? value.path || value.name : '请选择仓库'}
          </span>
          <span className="rp-caret">▼</span>
        </button>
      </div>

      {open && (
        <BottomSheet title="选择仓库" onClose={() => setOpen(false)}>
          {repos.length > 0 && (
            <>
              <input
                className="searchbox"
                style={{ width: '100%', marginBottom: 10 }}
                placeholder="搜索仓库"
                value={kw}
                onChange={(e) => setKw(e.target.value)}
                autoFocus
              />
              {filtered.length === 0 && <div className="center-note">没有匹配的仓库</div>}
              {filtered.map((r) => (
                <div
                  key={r.id || r.path}
                  className="listrow"
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    onChange(r);
                    setOpen(false);
                  }}
                >
                  <div className="grow">
                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                    <div className="mono">{r.path}</div>
                  </div>
                  {value && (value.id === r.id || value.path === r.path) && (
                    <span className="tag badge-accent">当前</span>
                  )}
                </div>
              ))}
            </>
          )}

          <div className="section-head" style={{ margin: '12px -16px 12px', borderRadius: 0 }}>
            <span>{repos.length > 0 ? '手动输入' : '无法获取仓库列表，请手动输入'}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="searchbox"
              placeholder="i0358/issue"
              value={manual}
              onChange={(e) => {
                setManual(e.target.value);
                setManualErr('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && submitManual()}
              style={{ minWidth: 0 }}
            />
            <button className="btn btn-primary" style={{ flexShrink: 0 }} onClick={submitManual}>
              使用
            </button>
          </div>
          {manualErr && (
            <div className="hint err" style={{ color: 'var(--red)', fontSize: 11.5, marginTop: 6 }}>
              {manualErr}
            </div>
          )}
          {repos.length === 0 && (
            <div className="hint" style={{ color: 'var(--fg-faint)', fontSize: 11.5, marginTop: 8 }}>
              令牌缺少 account-engage:r 权限时无法列出仓库，可直接输入「组织/仓库」。
            </div>
          )}
        </BottomSheet>
      )}
    </>
  );
}