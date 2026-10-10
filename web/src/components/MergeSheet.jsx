import { useState } from 'react';
import { mergePull } from '../api.js';
import { MERGE_STYLES, shortSha } from '../constants.js';
import { BottomSheet } from './ui.jsx';
import { useToast } from './Toast.jsx';

export default function MergeSheet({ repo, pull, onClose, onMerged }) {
  const toast = useToast();
  const [style, setStyle] = useState('squash'); // 默认 squash
  const [force, setForce] = useState(false);
  const [commitTitle, setCommitTitle] = useState(
    pull.title ? `${pull.title} (#${pull.number})` : ''
  );
  const [commitMessage, setCommitMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const doMerge = async () => {
    setBusy(true);
    try {
      const res = await mergePull(repo, pull.number, {
        merge_style: style,
        force,
        commit_title: commitTitle || undefined,
        commit_message: commitMessage || undefined,
      });
      if (res && res.merged === false) {
        toast(res.message || '合并未成功', 'err');
      } else {
        toast(`合并成功 ${res?.sha ? shortSha(res.sha) : ''}`, 'ok');
        onMerged?.(res);
      }
      onClose();
    } catch (e) {
      toast(e.message || '合并失败', 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      title="合并请求"
      onClose={onClose}
      footer={
        <button
          className="btn btn-success btn-block"
          onClick={doMerge}
          disabled={busy}
        >
          {busy ? '合并中…' : `确认合并（${
            MERGE_STYLES.find((m) => m.value === style)?.label || style
          }）`}
        </button>
      }
    >
      <div className="field" style={{ padding: 0 }}>
        <label>合并方式</label>
        <div className="chipset">
          {MERGE_STYLES.map((m) => (
            <button
              key={m.value}
              className={`chip ${style === m.value ? 'on' : ''}`}
              onClick={() => setStyle(m.value)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="hint" style={{ color: 'var(--fg-faint)', fontSize: 11.5, marginTop: 6 }}>
          {MERGE_STYLES.find((m) => m.value === style)?.hint}
        </div>
      </div>

      <div className="field" style={{ padding: '14px 0 0' }}>
        <label>合并提交标题</label>
        <input
          type="text"
          value={commitTitle}
          onChange={(e) => setCommitTitle(e.target.value)}
          placeholder="默认使用 PR 标题"
        />
      </div>

      <div className="field" style={{ padding: '14px 0 0' }}>
        <label>合并提交描述</label>
        <textarea
          style={{ minHeight: 80 }}
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder="可选"
        />
      </div>

      <div className="field" style={{ padding: '14px 0 0' }}>
        <button className={`chip ${force ? 'on' : ''}`} onClick={() => setForce(!force)}>
          {force ? '✓ ' : ''}强制合并（force）
        </button>
        <div className="hint" style={{ color: 'var(--fg-faint)', fontSize: 11.5, marginTop: 6 }}>
          仅仓库 Owner 或管理员可用，绕过分支保护规则，请谨慎使用。
        </div>
      </div>
    </BottomSheet>
  );
}