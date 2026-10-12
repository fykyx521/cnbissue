import { useEffect } from 'react';
import { readWorkMode, saveWorkMode } from '../api.js';

/**
 * 「替我上班」开关，对应评论接口的 `work_mode` 字段。
 *
 * 勾上后评论体变成 `{ body, work_mode: true }`，NPC 流水线才会拿到写权限
 * （可推代码、建分支、发 PR）；不勾时令牌以只读为主，只能看代码、写评论。
 * 选择记在本地，避免每条评论都要重勾。
 *
 * 开关值由父组件持有（发送评论时读取），本组件只负责把上次的选择读回来。
 */
export default function WorkModeToggle({ value, onChange, disabled }) {
  useEffect(() => {
    if (readWorkMode()) onChange(true);
    // 仅在挂载时同步一次本地选择，之后以父组件状态为准
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    const next = !value;
    saveWorkMode(next);
    onChange(next);
  };

  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12.5,
        color: value ? 'var(--accent)' : 'var(--fg-dim)',
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <input type="checkbox" checked={!!value} onChange={toggle} disabled={disabled} />
      替我上班（开启 NPC 工作模式，允许改代码）
    </label>
  );
}
