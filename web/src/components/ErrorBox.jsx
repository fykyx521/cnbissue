import { useState } from 'react';

export const OPEN_REPO_EVENT = 'cnb:open-repo-picker';

/** 打开仓库选择器（供列表页的错误提示等外部触发） */
export const openRepoPicker = () => window.dispatchEvent(new Event(OPEN_REPO_EVENT));

export function ErrorBox({ error, onRetry }) {
  const [switching, setSwitching] = useState(false);
  // 404 / 仓库不存在时，引导用户去切换仓库而不是只报错
  const showSwitch =
    /不存在|无访问权限|Resource not found|Not Found|404/i.test(error || '');

  return (
    <div className="error-box">
      <div>{error}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        {onRetry && (
          <button className="btn btn-sm" onClick={onRetry} disabled={switching}>
            重试
          </button>
        )}
        {showSwitch && (
          <button
            className="btn btn-sm btn-primary"
            onClick={() => {
              setSwitching(true);
              openRepoPicker();
            }}
          >
            切换仓库
          </button>
        )}
      </div>
    </div>
  );
}