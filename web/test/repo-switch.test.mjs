/**
 * 回归测试：切换仓库后的落点，以及底部 tab 栏不再压住滚动末尾（issue #33）。
 *
 * 两件事都不好在纯函数里测，所以直接对「线上那份源码」做结构断言：
 *   1. RepoPicker 选中仓库后，详情/编辑页必须回到对应列表页，
 *      否则会拿新仓库去请求旧编号；
 *   2. .content 必须给底部 tab 栏留出内边距，否则详情页最后一行被盖住。
 *
 * 跑：node web/test/repo-switch.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const src = (p) => fs.readFileSync(path.join(import.meta.dirname, '..', 'src', p), 'utf8');

let passed = 0;
const check = (name, fn) => {
  fn();
  passed++;
  console.log('  ✓', name);
};

const picker = src('components/RepoPicker.jsx');

console.log('切换仓库');

check('选中仓库后先判断要不要离开详情页', () => {
  assert.match(picker, /const pick = \(r\) => \{[\s\S]*?onChange\(r\);[\s\S]*?goListIfNeeded\(\);[\s\S]*?\};/);
});

check('只有 Issue/PR 的详情或编辑页才跳列表', () => {
  assert.match(picker, /if \(!\/\^\\\/\(issues\|pulls\)\\\/\/\.test\(loc\.pathname\)\) return;/);
});

check('跳转目标与被替换的页面同族，且用 replace 不留返回栈', () => {
  assert.match(
    picker,
    /nav\(loc\.pathname\.startsWith\('\/pulls'\) \? '\/pulls' : '\/issues', \{ replace: true \}\)/
  );
});

const css = src('styles.css');
const contentRule = css.match(/\.content \{[\s\S]*?\n\}/)[0];

console.log('底部留白');

check('.content 给 tab 栏与安全区留出内边距', () => {
  assert.match(contentRule, /padding-bottom: calc\(var\(--tabbar-h\) \+ var\(--safe-b\) \+ \d+px\);/);
});

check('列表页尾部已有「加载更多」垫底，不再叠加内边距', () => {
  assert.match(css, /\.content:has\(> \.loadmore\) \{\s*padding-bottom: 0;/);
});

console.log('\n每个输入框都能召唤 NPC');

const detail = src('pages/IssueDetail.jsx');
const pullDetail = src('pages/PullDetail.jsx');
const issueEdit = src('pages/IssueEdit.jsx');
const pullEdit = src('pages/PullEdit.jsx');

check('Issue 详情：评论框带快捷用语与替我上班', () => {
  assert.match(detail, /<CommentShortcuts value=\{draft\}/);
  assert.match(detail, /<WorkModeToggle value=\{workMode\}/);
});

check('PR 详情：评论框收进「讨论」标签，同样带这两样', () => {
  assert.match(pullDetail, /<CommentShortcuts value=\{draft\}/);
  assert.match(pullDetail, /<WorkModeToggle value=\{workMode\}/);
  assert.match(pullDetail, /key: 'discussion'[\s\S]*?<CommentShortcuts/);
});

check('Issue 编辑：描述框带这两样', () => {
  assert.match(issueEdit, /<CommentShortcuts value=\{body\}/);
  assert.match(issueEdit, /<WorkModeToggle value=\{workMode\}/);
});

check('PR 编辑：描述框带这两样', () => {
  assert.match(pullEdit, /<CommentShortcuts value=\{body\}/);
  assert.match(pullEdit, /<WorkModeToggle value=\{workMode\}/);
});

check('四个输入框都接了附件上传', () => {
  for (const s of [detail, pullDetail, issueEdit, pullEdit]) {
    assert.match(s, /<AssetPicker value=\{/);
  }
});

console.log(`\n${passed} 项全过\n`);
