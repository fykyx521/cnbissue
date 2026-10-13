/**
 * 回归测试：新建 Issue / 新建 PR 时「替我上班」也要生效（issue i0358/issue#41）。
 *
 * 问题现象：写单子的时候勾了「替我上班」，NPC 却没开工。
 * 原因：`work_mode` 只加在评论类的写接口上，两个「新建」接口
 *       （POST /-/issues、POST /-/pulls）压根没带这个字段，
 *       于是只是建了张单子，没人动手。
 *
 * 这里守住两件事：
 *   1. work_modeBody 的语义：勾上才有 `work_mode: true`，不勾就不出现该字段；
 *   2. 两个新建接口与两个编辑页真的把开关传下去了。
 *
 * 跑：node web/test/work-mode-create.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const src = (p) => fs.readFileSync(path.join(import.meta.dirname, '..', 'src', p), 'utf8');
const apiSrc = src('api.js');

// 只抽纯逻辑段求值，测的就是线上那份代码
const from = apiSrc.indexOf('export function workModeBody');
const to = apiSrc.indexOf('const WORK_MODE_KEY');
assert.ok(from > 0 && to > from, 'api.js 结构变了，抽取区间失效');

const tmp = path.join(import.meta.dirname, '.workmode.mjs');
fs.writeFileSync(
  tmp,
  apiSrc.slice(from, to).replace('export function workModeBody', 'function workModeBody') +
    '\nexport { workModeBody };\n'
);
const { workModeBody } = await import('file://' + tmp);
fs.unlinkSync(tmp);

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('  ✓', name);
}

console.log('work_mode 字段');

check('勾上时带 work_mode: true', () => {
  assert.deepEqual(workModeBody(true), { work_mode: true });
});

check('不勾时字段整个不出现（传 false 会被当成显式关闭）', () => {
  assert.deepEqual(workModeBody(false), {});
  assert.deepEqual(workModeBody(undefined), {});
});

check('undefined / 0 / 空串都不带字段', () => {
  for (const v of [undefined, null, 0, '']) assert.deepEqual(workModeBody(v), {});
});

console.log('新建接口透传开关');

check('createIssue 接收 workMode 并合进请求体', () => {
  assert.match(apiSrc, /export const createIssue = \(repo, body, workMode = false\)/);
  assert.match(apiSrc, /createIssue[\s\S]{0,160}workModeBody\(workMode\)/);
});

check('createPull 接收 workMode 并合进请求体', () => {
  assert.match(apiSrc, /export const createPull = \(repo, body, workMode = false\)/);
  assert.match(apiSrc, /createPull[\s\S]{0,160}workModeBody\(workMode\)/);
});

check('新建 Issue 页把开关传下去', () => {
  assert.match(src('pages/IssueEdit.jsx'), /await createIssue\([\s\S]{0,400}?workMode\s*\n\s*\);/);
});

check('新建 PR 页把开关传下去', () => {
  assert.match(src('pages/PullEdit.jsx'), /await createPull\([\s\S]{0,500}?workMode\s*\n\s*\);/);
});

check('编辑（补写描述）时不会误传 workMode', () => {
  assert.match(src('pages/IssueEdit.jsx'), /patchIssue\(repoPath, number, \{/);
  assert.match(src('pages/PullEdit.jsx'), /patchPull\(repoPath, number, \{/);
});

console.log(`\n${passed} 项全过\n`);
