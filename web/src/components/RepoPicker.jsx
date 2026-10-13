import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { listOrgRepos } from '../api.js';
import { BottomSheet } from './ui.jsx';
import { useToast } from './Toast.jsx';
import { OPEN_REPO_EVENT } from './ErrorBox.jsx';

const REPO_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const ORG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export default function RepoPicker({ repos, loading, value, onChange }) {
  const toast = useToast();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [kw, setKw] = useState('');
  const [orgList, setOrgList] = useState(null); // 按组织拉到的仓库，未拉取为 null
  const [orgBusy, setOrgBusy] = useState(false);
  const inputRef = useRef(null);

  // 列表页报错时可主动唤起本选择器
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_REPO_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_REPO_EVENT, onOpen);
  }, []);

  const all = useMemo(() => {
    const base = repos || [];
    return orgList ? [...orgList, ...base.filter((r) => !orgList.some((o) => o.path === r.path))] : base;
  }, [repos, orgList]);

  const filtered = useMemo(() => {
    const q = kw.trim().toLowerCase();
    if (!q) return all;
    return all.filter((r) =>
      [r.path, r.name, r.description].filter(Boolean).join(' ').toLowerCase().includes(q)
    );
  }, [all, kw]);

  const typed = kw.trim();
  const isRepoPath = REPO_RE.test(typed);
  const isOrg = ORG_RE.test(typed);
  const typedExists = isRepoPath && all.some((r) => r.path === typed);
  // 已有仓库列表时，不再提示「按组织展开」——避免把仓库名误当成组织名
  const showOrg = isOrg && !isRepoPath && all.length === 0;

  useEffect(() => {
    if (!open) {
      setKw('');
      setOrgList(null);
    }
  }, [open]);

  // 换了仓库，旧仓库的 Issue/PR 编号就失效了。
  // 停在详情页会拿新仓库去请求同一个编号，轻则 404 重则看错数据，
  // 统一回列表页，由列表页按新仓库重新拉取。
  const goListIfNeeded = () => {
    if (!/^\/(issues|pulls)\//.test(loc.pathname)) return;
    nav(loc.pathname.startsWith('/pulls') ? '/pulls' : '/issues', { replace: true });
  };

  const pick = (r) => {
    onChange(r);
    goListIfNeeded();
    setOpen(false);
  };

  const useTyped = () => {
    if (isRepoPath) return pick({ path: typed, name: typed.split('/')[1] });
    toast('请输入 组织/仓库，例如 i0358/issue', 'err');
  };

  // 输入组织名时，拉取该组织下的仓库用于选择
  const loadOrg = async () => {
    if (!isOrg || orgBusy) return;
    setOrgBusy(true);
    try {
      const list = await listOrgRepos(typed, { page: 1, page_size: 100 });
      setOrgList(Array.isArray(list) ? list : []);
      if (!list.length) toast(`组织 ${typed} 下没有可访问的仓库`, 'err');
    } catch (e) {
      toast(e.message || '加载组织仓库失败', 'err');
    } finally {
      setOrgBusy(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    if (typedExists && filtered.length === 1) return pick(filtered[0]);
    if (isRepoPath) return useTyped();
    if (isOrg) return loadOrg();
  };

  return (
    <>
      <div className="repopicker">
        <button className="repopicker-btn" onClick={() => setOpen(true)} disabled={loading}>
          <span className="rp-label">仓库</span>
          <span className="rp-name">
            {loading ? '加载中…' : value ? value.path || value.name : '选择或输入仓库'}
          </span>
          <span className="rp-caret">▼</span>
        </button>
      </div>

      {open && (
        <BottomSheet title="选择仓库" onClose={() => setOpen(false)}>
          <input
            ref={inputRef}
            className="searchbox"
            style={{ width: '100%', marginBottom: 4 }}
            placeholder="筛选仓库，或输入 组织/仓库"
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            onKeyDown={onKeyDown}
            autoFocus
          />
          <div className="hint" style={{ color: 'var(--fg-faint)', fontSize: 11.5, marginBottom: 10 }}>
            回车可直接使用输入的仓库；输入组织名可展开该组织下的仓库
          </div>

          {isRepoPath && (
            <div className="listrow" style={{ cursor: 'pointer' }} onClick={useTyped}>
              <div className="grow">
                <div style={{ fontWeight: 600, color: 'var(--accent)' }}>{typed}</div>
                <div className="mono">{typedExists ? '已在列表中' : '直接使用该仓库'}</div>
              </div>
              <span className="tag badge-accent">使用</span>
            </div>
          )}

          <div className="section-head" style={{ margin: '10px -16px 0', borderRadius: 0 }}>
            <span>{all.length ? `仓库 ${filtered.length}/${all.length}` : '仓库列表'}</span>
          </div>

          {!all.length && (
            <div className="center-note" style={{ padding: '18px 0' }}>
              暂无仓库列表，可直接在上方输入 组织/仓库
            </div>
          )}
          {all.length > 0 && filtered.length === 0 && (
            <div className="center-note" style={{ padding: '18px 0' }}>
              没有匹配「{typed}」的仓库
            </div>
          )}

          {filtered.map((r) => (
            <div
              key={r.id || r.path}
              className="listrow"
              style={{ cursor: 'pointer' }}
              onClick={() => pick(r)}
            >
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{r.name}</div>
                <div className="mono">{r.path}</div>
              </div>
              {value && value.path === r.path && <span className="tag badge-accent">当前</span>}
            </div>
          ))}

          {/* 列表为空时「按组织展开」是唯一出路，放在顶部；已有列表时沉到末尾，避免干扰筛选 */}
          {showOrg && (
            <div
              className="listrow"
              style={{ cursor: orgBusy ? 'default' : 'pointer', opacity: orgBusy ? 0.6 : 1 }}
              onClick={loadOrg}
            >
              <div className="grow">
                <div style={{ fontWeight: 600, color: 'var(--accent)' }}>{typed}</div>
                <div className="mono">
                  {orgBusy ? '加载中…' : '按组织名查找其下的仓库'}
                </div>
              </div>
              <span className="tag badge-accent">{orgBusy ? '…' : '展开'}</span>
            </div>
          )}
        </BottomSheet>
      )}
    </>
  );
}