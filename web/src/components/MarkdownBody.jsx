import { useState } from 'react';
import { useRepo } from '../App.jsx';
import { parseBody } from '../api.js';

/**
 * 单张图片。加载失败时换成一个带链接的占位块，
 * 不留一个又高又空的深色框——那在深色主题下看起来就是「黑屏」。
 */
function BodyImage({ seg }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <a href={seg.url} target="_blank" rel="noreferrer" className="md-image-broken" title={seg.name}>
        <span>🖼</span>
        <span className="grow" style={{ wordBreak: 'break-all' }}>{seg.name}</span>
        <span className="mono" style={{ color: 'var(--fg-faint)' }}>原图</span>
      </a>
    );
  }

  return (
    <a href={seg.url} target="_blank" rel="noreferrer" title={seg.name} className="md-image">
      <img src={seg.url} alt={seg.name} loading="lazy" onError={() => setFailed(true)} />
    </a>
  );
}

/**
 * 正文 / 评论渲染。CNB 的 body 是 HTML + Markdown 混合，
 * 这里只做一件事：把图片与附件就地渲染出来，其余按纯文本显示。
 *
 * 文本走 React 文本节点（自动转义，不开 dangerouslySetInnerHTML），
 * 图片经 /api/asset 代理取（私有仓库必须带令牌，路径已在 parseBody 里补好仓库前缀）。
 */
export default function MarkdownBody({ body, className }) {
  // 上下文里 repo 是 { path, name } 对象，而 parseBody 要的是 'org/repo' 字符串。
  // 传错会让 repoSeg 抛错，渲染期异常会整棵树卸载 —— 页面直接变黑屏。
  const { repo } = useRepo();
  const segments = parseBody(body, repo?.path);

  if (!segments.length) return null;

  const hasBlock = segments.some((s) => s.type !== 'text');

  return (
    <div className={`md-body${hasBlock ? ' md-body-inline' : ''}${className ? ' ' + className : ''}`}>
      {segments.map((seg, i) => {
        if (seg.type === 'image') {
          return <BodyImage key={i} seg={seg} />;
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
