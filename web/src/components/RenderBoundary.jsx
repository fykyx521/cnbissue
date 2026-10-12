import { Component } from 'react';

/**
 * 兜底错误边界。
 *
 * React 在渲染期抛异常时会卸载整棵树，页面变成一片空白/黑屏 ——
 * 用户看到的就是「打开这个 issue 黑屏」，且没有任何线索。
 * 有了它，渲染期异常会就地显示出来，其余页面还能用。
 *
 * 刻意保持最小实现：只包一层，不做自动重试，避免掩盖真正的 bug。
 */
export default class RenderBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // 控制台留痕，方便在手机上远程排查
    console.error('[render error]', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="error-box" style={{ margin: 14 }}>
        <div style={{ fontWeight: 650, marginBottom: 6 }}>页面渲染出错</div>
        <div className="mono" style={{ fontSize: 12.5, wordBreak: 'break-word' }}>
          {error?.message || String(error)}
        </div>
        <div style={{ marginTop: 10 }}>
          <button
            className="btn btn-sm"
            onClick={() => this.setState({ error: null })}
          >
            重试
          </button>
        </div>
      </div>
    );
  }
}
