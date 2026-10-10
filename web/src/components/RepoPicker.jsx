import { useEffect, useMemo, useState } from 'react';
import { BottomSheet } from './ui.jsx';

export default function RepoPicker({ repos, loading, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [kw, setKw] = useState('');

  const filtered = useMemo(() => {
    const q = kw.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter((r) => (r.path || r.name || '').toLowerCase().includes(q));
  }, [repos, kw]);

  useEffect(() => {
    if (!open) setKw('');
  }, [open]);

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
        </BottomSheet>
      )}
    </>
  );
}