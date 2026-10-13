/**
 * 回归测试：构建管理（issue i0358/issue#37）。
 *
 * 需求是「添加构建管理」，落地为底部新增「构建」Tab：列表 + 详情 + 停止。
 * 拆开看真正会出错的是纯逻辑那几块：
 * 1. 状态映射 —— CNB 的 stage 有 start（进行中），构建本身有 pending/success/error/cancel，
 *    映射表必须都认，认不出的要退化成灰色 badge 而不是 undefined；
 * 2. isBuildActive 决定「要不要轮询、能不能点停止」，判错会导致
 *    已结束的构建被反复轮询、或者正在跑的构建停不掉；
 * 3. formatDuration 直接渲染到界面，0 / NaN 不能吐「NaNs」「0ms」这种脏文本。
 *
 * 跑：node web/test/build-status.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const src = fs.readFileSync(
  path.join(import.meta.dirname, '..', 'src', 'constants.js'),
  'utf8'
);

// 只抽构建相关的纯逻辑段求值，测的就是线上那份代码
const start = src.indexOf('export const BUILD_STATUS');
assert.ok(start > 0, 'constants.js 里应能找到 BUILD_STATUS');
const core = src.slice(start);

const tmp = path.join(import.meta.dirname, '.build.mjs');
fs.writeFileSync(
  tmp,
  core.replace(/^export (const|function) /gm, '$1 ') +
    '\nexport { BUILD_STATUS, BUILD_STATES, buildStatusOf, isBuildActive, formatDuration };\n'
);
const { BUILD_STATES, buildStatusOf, isBuildActive, formatDuration } = await import(
  'file://' + tmp
);
fs.unlinkSync(tmp);

// --- 1. 状态映射 ---
assert.equal(buildStatusOf('success').label, '成功');
assert.equal(buildStatusOf('error').label, '失败');
assert.equal(buildStatusOf('cancel').label, '已取消');
// stage 独有的进行中态
assert.equal(buildStatusOf('start').label, '进行中');
// DebugDetection 这类被跳过的 stage，上游给的是 skipped
assert.equal(buildStatusOf('skipped').label, '已跳过');
// 大小写不敏感，上游偶尔给大写
assert.equal(buildStatusOf('SUCCESS').label, '成功');

// 认不出的状态不能返回 undefined 对象，否则渲染 .tone 会炸
const unknown = buildStatusOf('weird-state');
assert.equal(unknown.label, 'weird-state', '未知状态原样展示');
assert.equal(unknown.tone, 'badge-neutral', '未知状态退化成灰色');
assert.equal(buildStatusOf('').tone, 'badge-neutral', '空状态也要有兜底');

// --- 2. 进行中判定 ---
assert.equal(isBuildActive('pending'), true);
assert.equal(isBuildActive('start'), true);
assert.equal(isBuildActive('running'), true);
assert.equal(isBuildActive('success'), false);
assert.equal(isBuildActive('error'), false);
assert.equal(isBuildActive('cancel'), false);
// 空值必须判为「非进行中」，否则详情页会对不存在的构建空转轮询
assert.equal(isBuildActive(''), false);
assert.equal(isBuildActive(undefined), false);

// --- 3. 时长格式化 ---
assert.equal(formatDuration(0), '—');
assert.equal(formatDuration(NaN), '—');
assert.equal(formatDuration(undefined), '—');
assert.equal(formatDuration(-5), '—');
assert.equal(formatDuration(4000), '4.0s');
assert.equal(formatDuration(12000), '12s');
assert.equal(formatDuration(80000), '1m20s');
assert.equal(formatDuration(7200000), '2h0m');

// --- 4. 筛选项要覆盖上游全部状态枚举 ---
const values = BUILD_STATES.map((s) => s.value);
assert.deepEqual(values, ['', 'pending', 'success', 'error', 'cancel']);
assert.equal(BUILD_STATES[0].label, '全部', '空值筛选项应为「全部」');

console.log('build-status: 全部通过');
