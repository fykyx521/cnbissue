import { useEffect, useState } from 'react';

const KEY = 'cnb-manager:work-mode';

/**
 * 「替我上班」开关，对应评论接口的 `work_mode` 字段。
 *
 * 勾上后评论体变成 `{ body, work_mode: true }`，NPC 流水线才会拿到写权限
 * （可推代码、建分支、发 PR）；不勾时令牌以只读为主，只能看代码、写评论。
 * 选择记在本地，避免每条评论都要重勾。
 */
export default function WorkModeToggle({ value, onChange, disabled }) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const on = localStorage.getItem(KEY) === '1';
    setSaved(on);
    if (on) onChange(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    const next = !value;
    localStorage.setItem(KEY, next ? '1' : '0');
    setSaved(next);
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
