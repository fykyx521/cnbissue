/**
 * 主题：深色（默认）/ 浅色。
 *
 * 只做两件事：
 * 1. 把选择写进 `<html data-theme>`，颜色本身全在 styles.css 的变量里；
 * 2. 记住选择，下次打开沿用。
 *
 * 纯逻辑（读取/校验/切换）与 React 分离，方便直接跑单测。
 */

export const THEMES = ['dark', 'light'];
export const STORAGE_KEY = 'cnb-manager:theme';
export const DEFAULT_THEME = 'dark';

export function isTheme(v) {
  return THEMES.includes(v);
}

/** 读存档。脏数据、旧版本的怪值一律退回默认深色，不报错。 */
export function readTheme() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isTheme(v) ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function writeTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* 隐私模式下 localStorage 可能不可写，忽略即可，当次会话仍然生效 */
  }
}

/** 深色 <-> 浅色的按钮文案与图标，说的都是「点了会变成什么」。 */
export function nextTheme(theme) {
  return theme === 'light' ? 'dark' : 'light';
}

export function toggleLabel(theme) {
  return nextTheme(theme) === 'light' ? '浅色' : '深色';
}

export function applyTheme(theme) {
  const t = isTheme(theme) ? theme : DEFAULT_THEME;
  document.documentElement.dataset.theme = t;
  // 移动端浏览器地址栏 / PWA 状态栏的配色，跟着一起换
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'light' ? '#f3f5f9' : '#0b0d12');
  return t;
}

/** 用内联脚本在首屏之前先把主题挂上，避免刷新时闪一下深色。 */
export const BOOTSTRAP_SCRIPT = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(t!=='light'&&t!=='dark')t='${DEFAULT_THEME}';document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;
