/**
 * 回归测试：浅色主题（issue i0358/issue#34）。
 *
 * 需求就一句「加个浅色主题」。验收看三件事：
 * 1. 主题变量齐全 —— 浅色主题不能漏掉任何一个深色主题里用到的变量，
 *    否则浅色下会露出深色底（漏 --bar-bg 就是一条黑顶栏）；
 * 2. 切换/记忆的逻辑正确，脏数据不炸；
 * 3. 首屏内联脚本与 theme.js 认的是同一个 localStorage key，
 *    否则会出现「切换后刷新又变回去」。
 *
 * 跑：node web/test/theme.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.join(import.meta.dirname, '..');
const css = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const themeSrc = fs.readFileSync(path.join(root, 'src', 'theme.js'), 'utf8');
const tmp = path.join(import.meta.dirname, '.theme.mjs');
fs.writeFileSync(tmp, themeSrc);
const { THEMES, STORAGE_KEY, DEFAULT_THEME, isTheme, nextTheme, toggleLabel } = await import(
  'file://' + tmp
);
fs.unlinkSync(tmp);

/** 从一段 CSS 里读出变量声明，`--x: y;` -> [['--x','y'], ...] */
function vars(block) {
  return Object.fromEntries(
    [...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()])
  );
}

const lines = css.split('\n');
const at = (needle) => lines.findIndex((l) => l.trim().startsWith(needle));
// 从选择器那一行取到下一个顶层选择器（即下一个顶格且以 * 或 : 开头的块）
function block(sel) {
  const from = at(sel);
  assert.ok(from > -1, `styles.css 里找不到 ${sel}`);
  let to = lines.length;
  for (let i = from + 1; i < lines.length; i++) {
    if (lines[i].startsWith('* {') || lines[i].startsWith(':root')) {
      to = i;
      break;
    }
  }
  return lines.slice(from, to).join('\n');
}
const dark = vars(block(':root {'));
const light = vars(block(":root[data-theme='light']"));

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('  ✓', name);
}

console.log('浅色主题');

check('默认是深色，光靠 data-theme 就能翻主题', () => {
  assert.equal(DEFAULT_THEME, 'dark');
  assert.deepEqual(THEMES, ['dark', 'light']);
  assert.ok(css.includes(":root[data-theme='light']"));
});

// 尺寸/安全区这类变量跟主题无关，只需在 :root 定义一次
const GEOMETRY = ['--radius', '--tap', '--tabbar-h', '--safe-b', '--safe-t'];

check('浅色主题覆盖了深色主题全部「颜色」变量，一个都不能漏', () => {
  const missing = Object.keys(dark).filter((k) => !GEOMETRY.includes(k) && !(k in light));
  assert.deepEqual(missing, [], `浅色主题缺变量：${missing.join(', ')}`);
});

check('变量命名分得清颜色与尺寸', () => {
  for (const k of GEOMETRY) assert.ok(dark[k], `${k} 应在 :root 中定义`);
});

check('背景、前景、描边这类主色在浅色下确实换了值', () => {
  for (const key of ['--bg', '--bg-elev', '--fg', '--line', '--bar-bg', '--tabbar-bg']) {
    assert.ok(light[key], `${key} 未在浅色主题中定义`);
    assert.notEqual(light[key], dark[key], `${key} 浅色与深色取值相同`);
  }
});

check('浅色背景确实是亮的（不是换个深色糊弄）', () => {
  const lum = (hex) => {
    const n = parseInt(hex.replace('#', ''), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };
  assert.ok(lum(light['--bg']) > 0.85, '--bg 不够亮');
  assert.ok(lum(light['--bg-elev']) > 0.9, '--bg-elev 不够亮');
  assert.ok(lum(light['--fg']) < 0.25, '--fg 不够暗，浅底上会看不清');
});

check('CSS 里不再有写死的深色底/白字漏网', () => {
  const body = css.slice(css.indexOf('* {'));
  assert.equal(body.includes('#0b0d12'), false, '仍有硬编码的深色底 #0b0d12');
  assert.equal(body.includes('rgba(11, 13, 18'), false, '仍有硬编码的深色顶栏');
  assert.equal(body.includes('color: #fff'), false, '仍有硬编码白字');
  assert.equal(body.includes('color: #04150a'), false, '仍有硬编码深绿字');
});

check('切换与文案：说的一直是「点了会变成什么」', () => {
  assert.equal(nextTheme('dark'), 'light');
  assert.equal(nextTheme('light'), 'dark');
  assert.equal(toggleLabel('dark'), '浅色');
  assert.equal(toggleLabel('light'), '深色');
});

check('isTheme 只认这两个值', () => {
  assert.equal(isTheme('dark'), true);
  assert.equal(isTheme('light'), true);
  for (const bad of ['auto', '', null, undefined, 'LIGHT', 0]) {
    assert.equal(isTheme(bad), false, `${String(bad)} 不该被当成合法主题`);
  }
});

check('首屏内联脚本与 theme.js 用同一个存档 key', () => {
  assert.equal(STORAGE_KEY, 'cnb-manager:theme', 'theme.js 的 key 变了，记得同步 index.html');
  assert.ok(html.indexOf(STORAGE_KEY) > -1, 'index.html 里的内联脚本没跟上');
  assert.ok(html.indexOf("t !== 'light' && t !== 'dark'") > -1, '内联脚本缺少脏数据兜底');
  assert.ok(html.indexOf('data-theme') > -1, '内联脚本没有设 data-theme');
});

check('内联脚本在挂载 React 之前执行', () => {
  assert.ok(html.indexOf("localStorage.getItem") < html.indexOf('/src/main.jsx'));
});

console.log(`\n${passed} 项全过\n`);
