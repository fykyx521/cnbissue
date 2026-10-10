import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * 弹层必须挂到 body 上。
 * .appbar / .tabbar 带有 backdrop-filter，会为 fixed 定位的后代创建包含块，
 * 若直接在组件树内渲染 .overlay，position: fixed 会相对 header/tabbar 定位而不是视口。
 */
export default function Portal({ children }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(children, document.body);
}