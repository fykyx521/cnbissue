import { useCallback, useEffect, useState } from 'react';
import {
  applyTheme,
  readTheme,
  toggleLabel,
  nextTheme,
  writeTheme,
} from '../theme.js';

/**
 * 深浅主题切换。状态挂在组件里，但真正的着色靠 `<html data-theme>`
 * （见 styles.css 的变量），所以切换只是一次属性写入，不会重渲染整棵树。
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState(readTheme);

  useEffect(() => {
    applyTheme(theme);
    writeTheme(theme);
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => nextTheme(t)), []);

  const label = toggleLabel(theme);
  return (
    <button
      className="iconbtn"
      onClick={toggle}
      title={`切换到${label}主题`}
      aria-label={`切换到${label}主题`}
    >
      {theme === 'light' ? '☾' : '☀'}
    </button>
  );
}
