/**
 * 回归测试：云开发（云原生开发环境）管理（issue i0358/issue#38）。
 *
 * 需求就四个字「添加云开发管理」。落在代码上是这几件事，逐条守住：
 * 1. 后端代理放行 /workspace/* —— 这是不挂仓库的顶层接口，
 *    不加白名单会被 403，前端全部功能哑火；
 * 2. 停止/删除的 body 只认 sn 或 pipelineId，且只能出现一个，
 *    空值要在发请求前拦下（否则接口报错还查不出原因）；
 * 3. duration 是人类可读文案，脏数据（null/负数/NaN）不能渲染出 "NaN 分钟"；
 * 4. 页面、路由、底部 Tab 真的接上了。
 *
 * 跑：node web/test/workspace.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.join(import.meta.dirname, '..');
const repoRoot = path.join(root, '..');

const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');

const serverSrc = fs.readFileSync(path.join(repoRoot, 'server.js'), 'utf8');
const apiSrc = read('src', 'api.js');
const constSrc = read('src', 'constants.js');
const appSrc = read('src', 'App.jsx');

// ---------- 1. 后端白名单 ----------
// 直接抽 server.js 里的判定逻辑求值，测的就是线上那份白名单
const allowedTop = serverSrc.match(/const ALLOWED_TOP = new Set\(\[([^\]]*)\]\)/)
  ? new Function(
      'return [' + serverSrc.match(/const ALLOWED_TOP = new Set\(\[([^\]]*)\]\)/)[1] + ']'
    )()
  : null;

function proxyAllowed(target) {
  const decoded = target.split('/').filter(Boolean).map((s) => decodeURIComponent(s));
  return (
    allowedTop.includes(decoded[0]) ||
    (decoded.length >= 3 && decoded[2] === '-') ||
    (decoded.length >= 2 && decoded[1] === '-') ||
    (decoded.length === 1 && decoded[0] !== '..' && decoded[0] !== '.')
  );
}

// ---------- 2. 求解前端纯逻辑 ----------
// api.js 依赖 REPO_RE / ApiError，这里补齐依赖后整体求值
// repoSeg 所在的这一段已经包含了 ApiError 定义，不再另行补桩
const apiCore = [
  apiSrc.slice(
    apiSrc.indexOf('function repoSeg'),
    apiSrc.indexOf('/** 我的开发环境列表')
  ),
  apiSrc.slice(apiSrc.indexOf('function workspaceTarget')),
].join('\n').replace(/^export (const|function|class) /gm, '$1 ');

const apiTmp = path.join(import.meta.dirname, '.workspace-api.mjs');
fs.writeFileSync(apiTmp, apiCore + '\nexport { workspaceTarget };\n');
const { workspaceTarget } = await import('file://' + apiTmp);
fs.unlinkSync(apiTmp);

// 存活时长文案是独立纯函数（与构建的 formatDuration 区分，命名 formatWorkspaceDuration）
const durTmp = path.join(import.meta.dirname, '.workspace-dur.mjs');
fs.writeFileSync(
  durTmp,
  constSrc.slice(constSrc.indexOf('export function formatWorkspaceDuration'))
);
const { formatWorkspaceDuration: formatDuration } = await import('file://' + durTmp);
fs.unlinkSync(durTmp);

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('  ✓', name);
}

console.log('云开发管理');

console.log(' 代理白名单');
check('workspace 顶层接口被放行（否则前端全哑）', () => {
  assert.ok(proxyAllowed('workspace/list'));
  assert.ok(proxyAllowed('workspace/stop'));
  assert.ok(proxyAllowed('workspace/delete'));
});
check('仓库维度的启动 / 详情地址被放行', () => {
  assert.ok(proxyAllowed('i0358/issue/-/workspace/start'));
  assert.ok(proxyAllowed('i0358/issue/-/workspace/detail/123'));
});
check('放行 workspace 不等于放开整条路径', () => {
  assert.equal(proxyAllowed('evil.com/x'), false);
  assert.equal(proxyAllowed('../etc/passwd'), false);
});

console.log(' 停止 / 删除的定位参数');
check('只给 sn 时提交 { sn }', () => {
  assert.deepEqual(workspaceTarget('w-abc123'), { sn: 'w-abc123' });
});
check('只给 pipelineId 时提交 { pipelineId }', () => {
  assert.deepEqual(workspaceTarget({ pipelineId: '9527' }), { pipelineId: '9527' });
});
check('两个都给时优先 pipelineId', () => {
  assert.deepEqual(workspaceTarget({ sn: 'w-1', pipelineId: '9527' }), {
    pipelineId: '9527',
  });
});
check('空值当场拦下，不发出注定失败的请求', () => {
  assert.throws(() => workspaceTarget(''));
  assert.throws(() => workspaceTarget(null));
  assert.throws(() => workspaceTarget(undefined));
});
check('数字型 sn 也能用（接口返回的 sn 可能是数字）', () => {
  assert.deepEqual(workspaceTarget(123), { sn: '123' });
});

console.log(' 存活时长文案');
check('分钟 / 小时 / 天三档往上走', () => {
  assert.equal(formatDuration(5 * 60 * 1000), '5 分钟');
  assert.equal(formatDuration((3 * 60 + 12) * 60 * 1000), '3 小时 12 分');
  assert.equal(formatDuration((25 * 60 + 30) * 60 * 1000), '1 天 1 小时');
});
check('不足一分钟与脏数据都不渲染出 NaN', () => {
  for (const bad of [null, undefined, NaN, -1, 0, 'abc']) {
    const out = formatDuration(bad);
    assert.equal(typeof out, 'string');
    assert.ok(!/NaN|undefined/.test(out), `formatDuration(${bad}) = ${out}`);
  }
});

console.log(' 接线');
check('三个页面文件都在', () => {
  for (const f of ['WorkspaceList.jsx', 'WorkspaceDetail.jsx', 'WorkspaceNew.jsx']) {
    assert.ok(fs.existsSync(path.join(root, 'src', 'pages', f)), `缺少 ${f}`);
  }
});
check('路由挂上了列表 / 新建 / 详情', () => {
  assert.match(appSrc, /path="\/workspaces"/);
  assert.match(appSrc, /path="\/workspaces\/new"/);
  assert.match(appSrc, /path="\/workspaces\/:slug\/:sn"/);
});
check('底部 Tab 有「云开发」入口', () => {
  assert.match(appSrc, /key:\s*'workspaces'[\s\S]{0,80}云开发/);
});
check('api.js 暴露了 5 个 workspace 接口', () => {
  for (const fn of [
    'listWorkspaces',
    'stopWorkspace',
    'deleteWorkspace',
    'startWorkspace',
    'getWorkspaceDetail',
  ]) {
    assert.match(apiSrc, new RegExp(`export const ${fn}\\b`), `缺少 ${fn}`);
  }
});

console.log(`\n${passed} 项全过\n`);
