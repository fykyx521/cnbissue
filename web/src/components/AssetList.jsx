import { extractAssets } from '../api.js';

/**
 * Issue 正文附件列表。图片给缩略图点击放大，其余给下载入口。
 * 私有仓库的附件必须经 /api/asset 代理取，url 已由 api.js 改写。
 */
export default function AssetList({ body }) {
  const assets = extractAssets(body);
  if (!assets.length) return null;

  const images = assets.filter((a) => a.kind === 'image');
  const files = assets.filter((a) => a.kind === 'file');

  return (
    <div style={{ marginTop: 10 }}>
      {images.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))',
            gap: 8,
          }}
        >
          {images.map((a) => (
            <a key={a.url} href={a.url} target="_blank" rel="noreferrer" title={a.name}>
              <img
                src={a.url}
                alt={a.name}
                loading="lazy"
                style={{
                  width: '100%',
                  aspectRatio: '1 / 1',
                  objectFit: 'cover',
                  borderRadius: 10,
                  border: '1px solid var(--line)',
                  background: 'var(--bg-elev)',
                }}
              />
            </a>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: images.length ? 8 : 0 }}>
          {files.map((a) => (
            <a
              key={a.url}
              href={a.url}
              target="_blank"
              rel="noreferrer"
              className="listrow"
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <span style={{ fontSize: 16 }}>📄</span>
              <span className="grow" style={{ wordBreak: 'break-all' }}>{a.name}</span>
              <span className="mono" style={{ color: 'var(--fg-faint)' }}>下载</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}