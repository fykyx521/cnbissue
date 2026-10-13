import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listWorkspaces } from '../api.js';
import { usePagedList, useInfiniteScroll } from '../hooks.js';
import { WORKSPACE_STATES } from '../constants.js';
import { WorkspaceCard } from '../components/cards.jsx';
import { Empty, Skeleton } from '../components/ui.jsx';
import { ErrorBox } from '../components/ErrorBox.jsx';

/**
 * 云原生开发环境列表。
 *
 * 与 Issue / PR 不同，开发环境是**用户维度**的资源，不属于某个仓库，
 * 因此这里不依赖顶部选中的仓库，打开就能看全部环境。
 * 支持按状态（运行中 / 已关闭）与仓库关键词筛选，触底分页。
 */
export default function WorkspaceList() {
  const nav = useNavigate();
  const [status, setStatus] = useState('running');
  const [input, setInput] = useState('');
  const [slug, setSlug] = useState('');

  const fetchPage = useCallback(
    (page) =>
      listWorkspaces({
        page,
        page_size: 20,
        status: status || undefined,
        slug: slug || undefined,
      }),
    [status, slug]
  );

  const { items, loading, loadingMore, refreshing, error, done, reload, loadMore } = usePagedList({
    fetchPage,
  });

  const sentinel = useInfiniteScroll(loadMore, !loading && !done);

  return (
    <>
      <div className="filterbar">
        <select
          className="filter-select"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {WORKSPACE_STATES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <input
          className="searchbox"
          type="search"
          placeholder="按仓库筛选，如 org/repo"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onBlur={() => setSlug(input.trim())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setSlug(input.trim());
          }}
        />
      </div>

      {refreshing && <div className="center-note">刷新中…</div>}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && <Skeleton count={5} />}
      {!loading && !error && items.length === 0 && (
        <Empty ico="🧰" text="没有符合条件的开发环境" />
      )}
      {items.map((ws) => (
        <WorkspaceCard key={ws.pipeline_id || ws.sn} ws={ws} />
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
        onClick={() => nav('/workspaces/new')}
        aria-label="启动云原生开发"
      >
        ＋
      </button>
    </>
  );
}
