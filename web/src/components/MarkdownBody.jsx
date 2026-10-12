import { useRepo } from '../App.jsx';
import { parseBody } from '../api.js';

/**
 * 正文 / 评论渲染。CNB 的 body 是 HTML + Markdown 混合，
 * 这里只做一件事：把图片与附件就地渲染出来，其余按纯文本显示。
 *
 * 文本走 React 文本节点（自动转义，不开 dangerouslySetInnerHTML），
 * 图片经 /api/asset 代理取（私有仓库必须带令牌，路径已在 parseBody 里补好仓库前缀）。
 */
export default function MarkdownBody({ body, className }) {
  const { repo } = useRepo();
  const segments = parseBody(body, repo);

  if (!segments.length) return null;

  const hasBlock = segments.some((s) => s.type !== 'text');

  return (
    <div className={`md-body${hasBlock ? ' md-body-inline' : ''}${className ? ' ' + className : ''}`}>
      {segments.map((seg, i) => {
        if (seg.type === 'image') {
          return (
            <a key={i} href={seg.url} target="_blank" rel="noreferrer" title={seg.name} className="md-image">
              <img src={seg.url} alt={seg.name} loading="lazy" />
            </a>
          );
        }
        if (seg.type === 'file') {
          return (
            <a
              key={i}
              href={seg.url}
              target="_blank"
              rel="noreferrer"
              className="md-file"
              title={seg.name}
            >
              <span>📄</span>
              <span className="grow" style={{ wordBreak: 'break-all' }}>{seg.name}</span>
              <span className="mono" style={{ color: 'var(--fg-faint)' }}>下载</span>
            </a>
          );
        }
        return <span key={i}>{seg.text}</span>;
      })}
    </div>
  );
}
