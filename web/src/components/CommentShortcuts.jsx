import { useEffect, useState } from 'react';
import { readWorkMode } from '../api.js';
import { NPC_NAME } from '../constants.js';

/**
 * 评论框上方的快捷用语 chip：点一下把招呼语填进草稿，省得每次手敲 `@CodeBuddy`。
 *
 * 只改草稿，不代发，也不动「替我上班」开关 —— 发不发、开不开工作模式仍归用户决定。
 * 插入逻辑抽成纯函数 `insertShortcut`，方便直接跑单测。
 */

export const SHORTCUTS = [
  { key: 'summon', label: '召唤 CodeBuddy', text: `@${NPC_NAME} ` },
  { key: 'fix', label: '改代码', text: `@${NPC_NAME} 帮我改掉这个问题：` },
  { key: 'explain', label: '解释一下', text: `@${NPC_NAME} 解释一下这里为什么这么写：` },
  { key: 'test', label: '加个测试', text: `@${NPC_NAME} 给这段加个测试：` },
  { key: 'review', label: '看看这个 PR', text: `@${NPC_NAME} 帮我看看这个 PR：` },
];

const SUMMON = SHORTCUTS[0].text;

function stripLeadingShortcut(s) {
  const hit = SHORTCUTS.filter((it) => s.startsWith(it.text)).sort(
    (a, b) => b.text.length - a.text.length
  )[0];
  return hit ? s.slice(hit.text.length) : s;
}

/**
 * 把招呼语插到草稿最前面，正文原样保留。
 *
 * 草稿开头已经是某条招呼语时直接换掉，不叠加成 `@CodeBuddy @CodeBuddy …`；
 * 正文中间的 `@CodeBuddy` 不算招呼语，不会被误摘。
 */
export function insertShortcut(draft, text) {
  const body = stripLeadingShortcut(String(draft ?? '')).replace(/^\s+/, '');
  if (text === SUMMON && !body) return SUMMON;
  return text + body;
}

/** 摘掉草稿开头那条招呼语，留下正文。 */
export function removeShortcut(draft) {
  return stripLeadingShortcut(String(draft ?? '')).trimStart();
}

/** 找出当前草稿用的是哪条快捷语，没有则返回 null。 */
export function activeShortcut(draft) {
  const s = String(draft ?? '');
  if (stripLeadingShortcut(s) === s) return null;
  // 前面的 strip 已按最长匹配取词，这里再挑一次同一条即可
  return SHORTCUTS.filter((it) => s.startsWith(it.text)).sort(
    (a, b) => b.text.length - a.text.length
  )[0]?.key;
}

/**
 * 详情页与编辑页共用的纯逻辑：工作模式 + 当前草稿用的是哪条快捷语。
 *
 * 放在这里而不是拆成独立模块，是因为这两个页面都通过 CommentShortcuts
 * 这一条路径拿到它们；编辑页没有评论接口，但仍然要能召唤 NPC 并带上工作模式。
 */
export function useCommentExtras(draft, initialWorkMode = true) {
  const [workMode, setWorkMode] = useState(initialWorkMode);
  // 本地记录过选择就以本地为准
  useEffect(() => {
    if (readWorkMode()) setWorkMode(true);
  }, []);
  const shortcut = activeShortcut(draft);
  return { workMode, setWorkMode, shortcut };
}

export default function CommentShortcuts({ value, onChange, disabled }) {
  const active = activeShortcut(value);

  const pick = (item) => {
    const next = active === item.key ? removeShortcut(value) : insertShortcut(value, item.text);
    onChange(next);
  };

  return (
    <div className="chipset" style={{ gap: 6 }}>
      {SHORTCUTS.map((it) => (
        <button
          key={it.key}
          type="button"
          className={`chip short${active === it.key ? ' on' : ''}`}
          disabled={disabled}
          onClick={() => pick(it)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
