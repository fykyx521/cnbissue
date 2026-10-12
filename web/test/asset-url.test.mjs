/**
 * 回归测试：正文/评论里的图片地址解析。
 *
 * 背景（issue i0358/stock-panel-data#340）：
 * CNB API 回传的正文里，用户截图是**绝对地址** https://cnb.cool/{org}/{repo}/-/imgs/...，
 * 而 proxiedAsset 早期对 http(s) 绝对地址直接放行，于是私有仓库的图带着裸链去请求，
 * 服务端 400/401 → 图片裂开 → 深色主题下留一个大黑框，看起来就是「黑屏」。
 *
 * 跑：node web/test/asset-url.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const apiSrc = fs.readFileSync(
  path.join(import.meta.dirname, '..', 'src', 'api.js'),
  'utf8'
);

// 从 api.js 里抽出纯逻辑段（附件路径改写 + 正文解析）单独求值，
// 免去引入 React / 浏览器环境，也保证测的就是线上那份代码。
const lines = apiSrc.split('\n');
const from = lines.findIndex((l) => l.includes("const UPLOAD = '/api/upload'"));
const to = lines.findIndex(
  (l, i) => i > from && l.startsWith('/**') && lines[i + 1]?.includes('上传附件到 Issue')
);
assert.ok(from > 0 && to > from, 'api.js 结构变了，抽取区间失效');

const core = [
  'class ApiError extends Error {}',
  'const REPO_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\\/[A-Za-z0-9][A-Za-z0-9._-]*$/;',
  ...lines.slice(5, 15),
  ...lines.slice(from, to).map((l) => l.replace(/^export /, '')),
  'export { parseBody, proxiedAsset };',
].join('\n');

const tmp = path.join(import.meta.dirname, '.parsecore.mjs');
fs.writeFileSync(tmp, core);
const { parseBody, proxiedAsset } = await import('file://' + tmp);
fs.unlinkSync(tmp);

const REPO = 'i0358/stock-panel-data';
const ASSET = '/api/asset/';

let pass = 0;
const cases = [];
const eq = (name, got, want) => {
  cases.push([name, got, want]);
};

// 1. 绝对地址的 CNB 附件：必须收进代理，否则私有仓库取不到
eq(
  'cnb.cool 绝对图片链 → 走代理',
  proxiedAsset(
    `https://cnb.cool/${REPO}/-/imgs/issues/2109622171142774784/qAfFqfmKkran8a3IGs8hOL/75ce9f08.png`,
    REPO
  ),
  `${ASSET}${REPO}/-/imgs/issues/2109622171142774784/qAfFqfmKkran8a3IGs8hOL/75ce9f08.png`
);
eq(
  'api.cnb.cool 绝对链 → 走代理',
  proxiedAsset(`https://api.cnb.cool/${REPO}/-/imgs/issues/1/a/b.png`, REPO),
  `${ASSET}${REPO}/-/imgs/issues/1/a/b.png`
);
eq(
  '绝对地址的附件（files）→ 走代理',
  proxiedAsset(`https://cnb.cool/${REPO}/-/files/issues/1/a/b/%E6%8A%A5%E5%91%8A.pdf`, REPO),
  `${ASSET}${REPO}/-/files/issues/1/a/b/%E6%8A%A5%E5%91%8A.pdf`
);

// 2. 第三方图床与伪装域名：必须原样放行，绝不塞进带令牌的代理
eq(
  '第三方图床原样放行',
  proxiedAsset('https://avatars.githubusercontent.com/u/1?v=4', REPO),
  'https://avatars.githubusercontent.com/u/1?v=4'
);
eq(
  '伪装成 cnb 的域名不放行',
  proxiedAsset(`https://cnb.cool.evil.com/${REPO}/-/imgs/issues/1/a/b.png`, REPO),
  `https://cnb.cool.evil.com/${REPO}/-/imgs/issues/1/a/b.png`
);
eq(
  'cnb 的非附件页面保持原样',
  proxiedAsset(`https://cnb.cool/${REPO}`, REPO),
  `https://cnb.cool/${REPO}`
);

// 3. 原有相对路径行为不能回归
eq(
  '仓库相对路径补前缀',
  proxiedAsset('/-/imgs/issues/1/a/b.png', REPO),
  `${ASSET}${REPO}/-/imgs/issues/1/a/b.png`
);
eq(
  '已带前缀的直通',
  proxiedAsset(`${REPO}/-/files/issues/1/a/b/c.pdf`, REPO),
  `${ASSET}${REPO}/-/files/issues/1/a/b/c.pdf`
);
eq(
  '空值返回空串',
  proxiedAsset('', REPO),
  ''
);

// 4. 真实评论形态：HTML <img> 与 Markdown 图片都要走代理
const realComment = `添加到主屏幕多了/pwa

<img src="https://cnb.cool/${REPO}/-/imgs/issues/2109622171142774784/qAfFqfmKkran8a3IGs8hOL/75ce9f08.png" class="cnb-md-image__upload" /> @CodeBuddy `;
const segs = parseBody(realComment, REPO);
const img = segs.find((s) => s.type === 'image');
eq('真实评论解析出图片片段', !!img, true);
eq('真实评论的图片已改走代理', img?.url?.startsWith(ASSET), true);
eq(
  '图片前后文本被保留',
  segs.filter((s) => s.type === 'text').map((s) => s.text).join('').includes('@CodeBuddy'),
  true
);
eq(
  'Markdown 图片同样走代理',
  parseBody(`![截图](https://cnb.cool/${REPO}/-/imgs/issues/1/a/b.png)`, REPO).find(
    (s) => s.type === 'image'
  )?.url,
  `${ASSET}${REPO}/-/imgs/issues/1/a/b.png`
);
eq(
  '附件链接解析成下载入口',
  parseBody('见附件 [报告.pdf](/-/files/issues/1/a/b/报告.pdf)', REPO).some((s) => s.type === 'file'),
  true
);
// 第三方图片不能被改写（否则会把外部流量灌进我们的令牌代理）
eq(
  '第三方图片保持原 URL',
  parseBody('![x](https://example.com/a.png)', REPO).find((s) => s.type === 'image')?.url,
  'https://example.com/a.png'
);

// 5. 渲染期安全：误传 { path } 对象不能抛异常（渲染期抛错会整棵树卸载 → 黑屏）
//    修复前：parseBody(body, repo) 传的是上下文里的 repo 对象，
//    repoSeg 抛「仓库名不合法：[object Object]」，IssueDetail 整页变空白。
eq(
  '传入 { path } 对象不抛异常（黑屏回归）',
  proxiedAsset('/-/imgs/issues/1/a/b.png', { path: REPO, name: 'stock-panel-data' }),
  '/-/imgs/issues/1/a/b.png'
);
eq(
  '传入对象时 parseBody 也不抛',
  (() => {
    try {
      parseBody('![x](/-/imgs/issues/1/a/b.png)', { path: REPO });
      return 'ok';
    } catch (e) {
      return 'threw: ' + e.message;
    }
  })(),
  'ok'
);
eq(
  '显式传字符串仍走代理',
  proxiedAsset('/-/imgs/issues/1/a/b.png', REPO),
  `${ASSET}${REPO}/-/imgs/issues/1/a/b.png`
);

for (const [name, got, want] of cases) {
  try {
    assert.deepEqual(got, want);
    pass++;
    console.log(`  ok   ${name}`);
  } catch {
    console.log(`  FAIL ${name}\n       got:  ${JSON.stringify(got)}\n       want: ${JSON.stringify(want)}`);
    process.exitCode = 1;
  }
}

console.log(`\n${cases.length} 项，通过 ${pass}，失败 ${cases.length - pass}`);
