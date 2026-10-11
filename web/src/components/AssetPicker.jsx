import { useEffect, useRef, useState } from 'react';
import { assetsToMarkdown, uploadIssueAssets } from '../api.js';
import { useToast } from './Toast.jsx';
import { useRepo } from '../App.jsx';

/**
 * Issue / 评论的附件上传。
 * 上传成功后把 asset_link 追加到 onChange 给出的正文末尾。
 */
export default function AssetPicker({ value, onChange, disabled, compact }) {
  const { repo } = useRepo();
  const toast = useToast();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState([]);

  // 预览 URL 统一登记在 ref 里，只在卸载时回收。
  // 若挂在 useEffect 依赖上，pending 每次变化都会先跑 cleanup，
  // 把仍在列表里显示的旧预览 revoke 掉，图片会变成空白。
  const previewsRef = useRef(new Set());
  useEffect(() => {
    const urls = previewsRef.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  if (!repo?.path) return null;

  const pick = () => inputRef.current?.click();

  const onFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;

    // 先用本地 objectURL 立即预览，不等上传往返
    const previews = files
      .filter((f) => f.type.startsWith('image/'))
      .map((f) => {
        const url = URL.createObjectURL(f);
        previewsRef.current.add(url);
        return { name: f.name, preview: url, size: f.size };
      });
    setPending((p) => [...p, ...previews]);

    setBusy(true);
    try {
      const done = await uploadIssueAssets(repo.path, files);
      const md = assetsToMarkdown(done);
      if (md) {
        onChange(value ? `${value.replace(/\s*$/, '')}\n\n${md}` : md);
      }
      toast(`已上传 ${done.length} 个附件`, 'ok');
      setPending([]);
    } catch (err) {
      toast(err.message || '上传失败', 'err');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const fmtSize = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,.zip,.pdf,.txt,.log,.json,.patch,.diff"
        onChange={onFiles}
        style={{ display: 'none' }}
      />
      <button
        type="button"
        className="btn btn-sm"
        onClick={pick}
        disabled={disabled || busy}
        style={{ alignSelf: compact ? 'flex-start' : 'stretch' }}
      >
        {busy ? '上传中…' : '📎 上传图片 / 附件'}
      </button>

      {pending.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {pending.map((p) => (
            <img
              key={p.preview}
              src={p.preview}
              alt={p.name}
              style={{
                width: 64,
                height: 64,
                objectFit: 'cover',
                borderRadius: 10,
                border: '1px solid var(--line)',
                opacity: 0.6,
              }}
            />
          ))}
        </div>
      )}
      {pending.length > 0 && (
        <div className="hint" style={{ color: 'var(--fg-faint)', fontSize: 11.5 }}>
          {pending.map((p) => `${p.name} ${fmtSize(p.size)}`).join('，')}上传中…
        </div>
      )}
    </div>
  );
}