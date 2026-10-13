import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { getRepos } from './api.js';
import RepoPicker from './components/RepoPicker.jsx';
import IssueList from './pages/IssueList.jsx';
import IssueDetail from './pages/IssueDetail.jsx';
import IssueEdit from './pages/IssueEdit.jsx';
import PullList from './pages/PullList.jsx';
import PullDetail from './pages/PullDetail.jsx';
import PullEdit from './pages/PullEdit.jsx';
import BuildList from './pages/BuildList.jsx';
import BuildDetail from './pages/BuildDetail.jsx';
import WorkspaceList from './pages/WorkspaceList.jsx';
import WorkspaceDetail from './pages/WorkspaceDetail.jsx';
import WorkspaceNew from './pages/WorkspaceNew.jsx';
import RenderBoundary from './components/RenderBoundary.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';

const RepoCtx = createContext({ repo: null });
export const useRepo = () => useContext(RepoCtx);

const STORAGE_KEY = 'cnb-manager:repo';

// 存的是形如 i0358/issue 的纯字符串，避免与仓库列表接口耦合
function readSavedRepo() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const path = raw.startsWith('{') ? JSON.parse(raw).path : raw;
    if (!path || !/^[^/]+\/[^/]+$/.test(path)) return null;
    return { path, name: path.split('/')[1] };
  } catch {
    return null;
  }
}

const TABS = [
  { key: 'issues', path: '/issues', label: 'Issues', ico: '◎' },
  { key: 'pulls', path: '/pulls', label: 'PRs', ico: '⑂' },
  { key: 'builds', path: '/builds', label: '构建', ico: '🛠' },
  { key: 'workspaces', path: '/workspaces', label: '云开发', ico: '🧰' },
];

function Shell({ children, repos, repo, loading, onChange }) {
  const loc = useLocation();
  const nav = useNavigate();
  const active = TABS.find((t) => loc.pathname.startsWith(t.path))?.key;

  // 顶栏刷新：广播事件，由列表页消费
  const refresh = () => {
    window.dispatchEvent(new Event('cnb:reload'));
  };

  return (
    <>
      <header className="appbar">
        <div className="appbar-row">
          <button className="iconbtn" onClick={refresh} title="刷新" aria-label="刷新">
            ⟳
          </button>
          <div className="appbar-title">CNB Issue / PR</div>
          <ThemeToggle />
        </div>
        <RepoPicker repos={repos} loading={loading} value={repo} onChange={onChange} />
      </header>

      <main className="content">{children}</main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={active === t.key ? 'active' : ''}
            onClick={() => nav(t.path)}
          >
            <span className="ti">{t.ico}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </>
  );
}

export default function App() {
  const [repos, setRepos] = useState([]);
  const [repo, setRepo] = useState(readSavedRepo);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const saved = readSavedRepo();
      // getRepos 内部已做降级：优先 /user/repos，失败则用上次仓库所属的组织
      // 调 /{org}/-/repos，因此缺少 account-engage:r 时仍能列出仓库。
      const list = await getRepos(saved?.path?.split('/')[0]);
      setRepos(list);
      if (saved) {
        const match = list.find((r) => r.path === saved.path);
        if (match) setRepo(match);
      } else if (list.length) {
        setRepo(list[0]);
      }
      setLoading(false);
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (repo?.path) {
      localStorage.setItem(STORAGE_KEY, repo.path);
      // 仓库列表尚未加载完成时，新选的仓库可作为组织来源补拉列表
      if (!repos.length && !loading) {
        getRepos(repo.path.split('/')[0]).then((list) => list.length && setRepos(list));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo]);

  // 列表为空时，允许手动切换组织后重新拉取
  const handleRepoChange = useCallback(
    (r) => {
      setRepo(r);
      if (repos.length) return;
      getRepos(r.path.split('/')[0]).then((list) => list.length && setRepos(list));
    },
    [repos.length]
  );

  const ctx = useMemo(() => ({ repo, repos }), [repo, repos]);

  if (!ready) {
    return <div className="center-note" style={{ paddingTop: 120 }}>加载中…</div>;
  }

  return (
    <RepoCtx.Provider value={ctx}>
      <Shell repos={repos} repo={repo} loading={loading} onChange={handleRepoChange}>
        {/* 兜底：渲染期异常不再让整棵树卸载（那会表现为整页黑屏） */}
        <RenderBoundary>
          <Routes>
            <Route path="/" element={<Navigate to="/issues" replace />} />
            <Route path="/issues" element={<IssueList />} />
            <Route path="/issues/new" element={<IssueEdit />} />
            <Route path="/issues/:number" element={<IssueDetail />} />
            <Route path="/issues/:number/edit" element={<IssueEdit />} />
            <Route path="/pulls" element={<PullList />} />
            <Route path="/pulls/new" element={<PullEdit />} />
            <Route path="/pulls/:number" element={<PullDetail />} />
            <Route path="/pulls/:number/edit" element={<PullEdit />} />
            <Route path="/builds" element={<BuildList />} />
            <Route path="/builds/:sn" element={<BuildDetail />} />
            <Route path="/workspaces" element={<WorkspaceList />} />
            <Route path="/workspaces/new" element={<WorkspaceNew />} />
            <Route path="/workspaces/:slug/:sn" element={<WorkspaceDetail />} />
            <Route path="*" element={<Navigate to="/issues" replace />} />
          </Routes>
        </RenderBoundary>
      </Shell>
    </RepoCtx.Provider>
  );
}
