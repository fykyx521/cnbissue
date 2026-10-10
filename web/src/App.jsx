import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { getRepos } from './api.js';
import RepoPicker from './components/RepoPicker.jsx';
import IssueList from './pages/IssueList.jsx';
import IssueDetail from './pages/IssueDetail.jsx';
import IssueEdit from './pages/IssueEdit.jsx';
import PullList from './pages/PullList.jsx';
import PullDetail from './pages/PullDetail.jsx';
import PullEdit from './pages/PullEdit.jsx';

const RepoCtx = createContext({ repo: null });
export const useRepo = () => useContext(RepoCtx);

const STORAGE_KEY = 'cnb-manager:repo';

const TABS = [
  { key: 'issues', path: '/issues', label: 'Issues', ico: '◎' },
  { key: 'pulls', path: '/pulls', label: 'PRs', ico: '⑂' },
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
  const [repo, setRepo] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const list = await getRepos();
        setRepos(list);
        if (list.length) {
          const saved = localStorage.getItem(STORAGE_KEY);
          const match = list.find((r) => r.path === saved || r.id === saved);
          setRepo(match || list[0]);
        }
      } catch {
        // 拉取失败不阻塞，列表页会显示错误
      } finally {
        setLoading(false);
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (repo?.path) localStorage.setItem(STORAGE_KEY, repo.path);
  }, [repo]);

  const ctx = useMemo(() => ({ repo, repos }), [repo, repos]);

  if (!ready) {
    return <div className="center-note" style={{ paddingTop: 120 }}>加载中…</div>;
  }

  return (
    <RepoCtx.Provider value={ctx}>
      <Shell repos={repos} repo={repo} loading={loading} onChange={setRepo}>
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
          <Route path="*" element={<Navigate to="/issues" replace />} />
        </Routes>
      </Shell>
    </RepoCtx.Provider>
  );
}