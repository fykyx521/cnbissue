import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listPulls } from '../api.js';
import { usePagedList, useInfiniteScroll } from '../hooks.js';
import { PULL_STATES } from '../constants.js';
import { PullCard } from '../components/cards.jsx';
import { Empty, Skeleton } from '../components/ui.jsx';
import { useRepo } from '../App.jsx';

export default function PullList() {
  const { repo } = useRepo();
  const nav = useNavigate();
  const [state, setState] = useState('open');
  const [base, setBase] = useState('');
  const [input, setInput] = useState('');
  const [kw, setKw] = useState('');

  const repoPath = repo?.path;

  const fetchPage = useCallback(
    (page) =>
      listPulls(repoPath, {
        page,
        page_size: 20,
        state,
        base_ref: base || undefined,
        authors: kw || undefined,
        order_by: '-updated_at',
      }),
    [repoPath, state, base, kw]
  );

  const { items, loading, loadingMore, refreshing, error, done, loadMore } = usePagedList({
    fetchPage,
    enabled: !!repoPath,
  });

  const sentinel = useInfiniteScroll(loadMore, !loading && !done);

  if (!repoPath) {
    return <Empty ico="📦" text="请先在顶部选择一个仓库" />;
  }

  return (
    <>
      <div className="filterbar">
        <select className="filter-select" value={state} onChange={(e) => setState(e.target.value)}>
          {PULL_STATES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <input
          className="searchbox"
          type="search"
          placeholder="目标分支"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onBlur={() => setBase(input.trim())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setBase(input.trim());
          }}
          style={{ maxWidth: 120 }}
        />
      </div>

      {refreshing && <div className="center-note">刷新中…</div>}
      {error && <div className="error-box">{error}</div>}
      {loading && <Skeleton count={5} />}
      {!loading && !error && items.length === 0 && <Empty ico="🎉" text="没有符合条件的 PR" />}
      {items.map((p) => (
        <PullCard key={p.number} pull={p} />
      ))}

      <div ref={sentinel} className="loadmore">
        {loadingMore ? '加载中…' : done && items.length > 0 ? '没有更多了' : ''}
      </div>

      <button
        className="btn btn-primary"
        style={{
          position: 'fixed',
          right: 'max(16px, calc(50vw - 264px))',
          bottom: 'calc(var(--tabbar-h) + var(--safe-b) + 16px)',
          width: 52,
          padding: 0,
          borderRadius: 26,
          fontSize: 22,
          boxShadow: '0 8px 24px rgba(0,0,0,.5)',
        }}
        onClick={() => nav('/pulls/new')}
        aria-label="新建 PR"
      >
        ＋
      </button>
    </>
  );
}