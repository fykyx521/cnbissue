import { useRef, useState } from 'react';
import { Skeleton } from './ui.jsx';

/**
 * 懒加载 Tab：首次激活时才调用 loader 并缓存结果，切回已加载的 tab 不再请求。
 * items: [{ key, label, loader: () => Promise<any>, render: (data) => ReactNode }]
 */
export default function LazyTabs({ items }) {
  const cache = useRef({});
  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const current = items.find((i) => i.key === active);

  const handleSelect = async (item) => {
    setActive(item.key);
    if (cache.current[item.key] !== undefined) return;
    setLoading(true);
    setError('');
    try {
      cache.current[item.key] = await item.loader();
    } catch (e) {
      cache.current[item.key] = null;
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="detail-section">
      <div className="lazytabs">
        {items.map((item) => (
          <button
            key={item.key}
            className={item.key === active ? 'on' : ''}
            onClick={() => handleSelect(item)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {!active && <div className="center-note">点击上方标签按需加载</div>}
      {active && loading && <Skeleton count={3} />}
      {active && !loading && error && <div className="error-box">{error}</div>}
      {active && !loading && !error && cache.current[active] !== undefined && (
        <div>{current.render(cache.current[active])}</div>
      )}
    </div>
  );
}