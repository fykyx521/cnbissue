import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listIssues } from '../api.js';
import { usePagedList, useInfiniteScroll } from '../hooks.js';
import { ISSUE_STATES } from '../constants.js';
import { IssueCard } from '../components/cards.jsx';
import { Empty, Skeleton } from '../components/ui.jsx';
import { ErrorBox } from '../components/ErrorBox.jsx';
import { useRepo } from '../App.jsx';

export default function IssueList() {
  const { repo } = useRepo();
  const nav = useNavigate();
  const [state, setState] = useState('open');
  const [kw, setKw] = useState('');
  const [input, setInput] = useState('');

  const repoPath = repo?.path;

  const fetchPage = useCallback(
    (page) =>
      listIssues(repoPath, {
        page,
        page_size: 20,
        state,
        keyword: kw,
        order_by: '-updated_at',
      }),
    [repoPath, state, kw]
  );

  const { items, loading, loadingMore, refreshing, error, done, reload, loadMore, pull } =
    usePagedList({ fetchPage, enabled: !!repoPath });

  const sentinel = useInfiniteScroll(loadMore, !loading && !done);

  if (!repoPath) {
    return <Empty ico="📦" text="请先在顶部选择一个仓库" />;
  }

  return (
    <>
      <div className="filterbar">
        <select
          className="filter-select"
          value={state}
          onChange={(e) => setState(e.target.value)}
        >
          {ISSUE_STATES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <input
          className="searchbox"
          type="search"
          placeholder="搜索标题或内容"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setKw(input.trim());
          }}
          onBlur={() => setKw(input.trim())}
        />
        {kw && (
          <button
            className="iconbtn"
            onClick={() => {
              setInput('');
              setKw('');
            }}
          >
            ✕
          </button>
        )}
      </div>

      {refreshing && <div className="center-note">刷新中…</div>}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && <Skeleton count={5} />}
      {!loading && !error && items.length === 0 && (
        <Empty ico="🎉" text="没有符合条件的 Issue" />
      )}
      {items.map((it) => (
        <IssueCard key={it.number} issue={it} />
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
        onClick={() => nav('/issues/new')}
        aria-label="新建 Issue"
      >
        ＋
      </button>
    </>
  );
}