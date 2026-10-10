import { useCallback, useEffect, useRef, useState } from 'react';

/** 下拉刷新 + 触底分页加载的通用列表逻辑 */
export function usePagedList({ fetchPage, enabled = true }) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const pageRef = useRef(1);

  const load = useCallback(
    async (nextPage, mode) => {
      if (mode === 'more') setLoadingMore(true);
      else setLoading(true);
      setError('');
      try {
        const res = await fetchPage(nextPage);
        const list = Array.isArray(res) ? res : [];
        setItems((prev) => (nextPage === 1 ? list : [...prev, ...list]));
        pageRef.current = nextPage;
        setPage(nextPage);
        setDone(list.length === 0);
      } catch (e) {
        setError(e.message || '加载失败');
        if (nextPage === 1) setItems([]);
        setDone(true);
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [fetchPage]
  );

  const reload = useCallback(() => load(1, 'reload'), [load]);

  // 响应顶栏刷新按钮
  useEffect(() => {
    const onReload = () => enabled && reload();
    window.addEventListener('cnb:reload', onReload);
    return () => window.removeEventListener('cnb:reload', onReload);
  }, [enabled, reload]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || done) return;
    load(pageRef.current + 1, 'more');
  }, [load, loading, loadingMore, done]);

  const pull = useCallback(() => {
    setRefreshing(true);
    load(1, 'refresh');
  }, [load]);

  // 筛选条件变化时重置
  useEffect(() => {
    if (!enabled) {
      setItems([]);
      return;
    }
    setDone(false);
    load(1, 'reload');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, load]);

  return { items, loading, loadingMore, refreshing, error, done, reload, loadMore, pull };
}

/** 触底自动加载 */
export function useInfiniteScroll(onReach, canLoad) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) onReach();
      },
      { rootMargin: '200px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [onReach, canLoad]);
  return ref;
}