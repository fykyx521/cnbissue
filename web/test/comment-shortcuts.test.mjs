/**
 * 回归测试：评论框快捷用语（issue i0358/issue#30）。
 *
 * 需求是「每次输入一遍」太烦，给几个点一下就填好的 chip。
 * 校验的是插入语义：前置、不叠加、可收回、正文中间的同名串不能误摘。
 *
 * 跑：node web/test/comment-shortcuts.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const src = fs.readFileSync(
  path.join(import.meta.dirname, '..', 'src', 'components', 'CommentShortcuts.jsx'),
  'utf8'
);

// 组件依赖 React 与 constants，这里只抽纯逻辑段求值，测的就是线上那份代码
const core = [
  "const NPC_NAME = 'CodeBuddy';",
  src.slice(src.indexOf('export const SHORTCUTS'), src.indexOf('export default function')),
].join('\n');

// 去掉 `export const/function` 上的 export，末尾统一导出，方便直接 import 求值
const tmp = path.join(import.meta.dirname, '.shortcuts.mjs');
fs.writeFileSync(
  tmp,
  core.replace(/^export (const|function) /gm, '$1 ') +
    '\nexport { SHORTCUTS, insertShortcut, removeShortcut, activeShortcut };\n'
);

const { SHORTCUTS, insertShortcut, removeShortcut, activeShortcut } = await import(
  'file://' + tmp
);
fs.unlinkSync(tmp);

const summon = SHORTCUTS[0];
const fix = SHORTCUTS[1];

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('  ✓', name);
}

console.log('评论快捷用语');

check('空草稿插入招呼语，末尾留一个空格方便接着写', () => {
  assert.equal(insertShortcut('', summon.text), '@CodeBuddy ');
});

check('召唤时正文原样保留在后面', () => {
  assert.equal(insertShortcut('修一下登录', summon.text), '@CodeBuddy 修一下登录');
});

check('切换 chip 是换掉旧招呼语，不会叠加', () => {
  const first = insertShortcut('修一下登录', summon.text);
  assert.equal(insertShortcut(first, fix.text), '@CodeBuddy 帮我改掉这个问题：修一下登录');
});

check('再点同一个 chip 收回招呼语，只留正文', () => {
  const on = insertShortcut('修一下登录', fix.text);
  assert.equal(removeShortcut(on), '修一下登录');
});

check('正文中间的 @CodeBuddy 不算招呼语，不会被摘掉', () => {
  const body = '这里 @CodeBuddy 是平台 NPC，不是招呼语';
  assert.equal(removeShortcut(body), body);
});

check('activeShortcut 认得当前是高亮哪条', () => {
  assert.equal(activeShortcut(''), null);
  assert.equal(activeShortcut(insertShortcut('正文', summon.text)), 'summon');
  assert.equal(activeShortcut(insertShortcut('正文', fix.text)), 'fix');
});

check('只敲了招呼语没写正文时，也认为正在用第一条', () => {
  assert.equal(activeShortcut('@CodeBuddy '), 'summon');
});

check('非字符串/null 草稿不炸', () => {
  assert.equal(insertShortcut(null, summon.text), '@CodeBuddy ');
  assert.equal(removeShortcut(undefined), '');
  assert.equal(activeShortcut(null), null);
});

console.log(`\n${passed} 项全过\n`);
