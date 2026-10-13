import { useCallback, useState } from 'react';
import { listBuilds } from '../api.js';
import { usePagedList, useInfiniteScroll } from '../hooks.js';
import { BUILD_STATES } from '../constants.js';
import { BuildCard } from '../components/cards.jsx';
import { Empty, Skeleton } from '../components/ui.jsx';
import { ErrorBox } from '../components/ErrorBox.jsx';
import { useRepo } from '../App.jsx';

export default function BuildList() {
  const { repo } = useRepo();
  const [state, setState] = useState('');
  const [ref, setRef] = useState('');
  const [input, setInput] = useState('');

  const repoPath = repo?.path;

  // 列表接口返回 { total, data }，usePagedList 只认数组，这里取出 data 即可
  const fetchPage = useCallback(
    (page) =>
      listBuilds(repoPath, {
        page,
        page_size: 20,
        status: state || undefined,
        sourceRef: ref || undefined,
      }).then((res) => (Array.isArray(res) ? res : res?.data || [])),
    [repoPath, state, ref]
  );

  const { items, loading, loadingMore, refreshing, error, done, reload, loadMore } =
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
          {BUILD_STATES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <input
          className="searchbox"
          type="search"
          placeholder="源分支"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onBlur={() => setRef(input.trim())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setRef(input.trim());
          }}
          style={{ maxWidth: 120 }}
        />
      </div>

      {refreshing && <div className="center-note">刷新中…</div>}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && <Skeleton count={5} />}
      {!loading && !error && items.length === 0 && (
        <Empty ico="🛠️" text="没有符合条件的构建" />
      )}
      {items.map((b) => (
        <BuildCard key={b.sn} build={b} />
      ))}

      <div ref={sentinel} className="loadmore">
        {loadingMore ? '加载中…' : done && items.length > 0 ? '没有更多了' : ''}
      </div>
    </>
  );
}
