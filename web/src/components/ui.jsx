import Portal from './Portal.jsx';

export function Toast({ items }) {
  if (!items.length) return null;
  return (
    <div className="toast-wrap">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.tone || ''}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function BottomSheet({ title, onClose, children, footer }) {
  return (
    <Portal>
      <div className="overlay" onClick={onClose}>
        <div className="sheet" onClick={(e) => e.stopPropagation()}>
          <div className="sheet-head">
            <span>{title}</span>
            <button className="iconbtn" onClick={onClose} aria-label="关闭">
              ✕
            </button>
          </div>
          <div className="sheet-body">{children}</div>
          {footer ? <div className="sheet-foot">{footer}</div> : null}
        </div>
      </div>
    </Portal>
  );
}

export function Dialog({
  title,
  message,
  confirmText = '确定',
  tone = 'primary',
  onConfirm,
  onCancel,
  children,
}) {
  return (
    <Portal>
      <div className="overlay modal" onClick={onCancel}>
        <div className="dialog" onClick={(e) => e.stopPropagation()}>
          <div className="sheet-head">
            <span>{title}</span>
          </div>
          {children ? (
            <div className="dialog-body">{children}</div>
          ) : (
            <div className="dialog-body">{message}</div>
          )}
          <div className="dialog-foot">
            <button className="btn" onClick={onCancel}>
              取消
            </button>
            <button className={`btn btn-${tone}`} onClick={onConfirm}>
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

export function Empty({ ico = '📭', text }) {
  return (
    <div className="empty">
      <span className="ico">{ico}</span>
      {text}
    </div>
  );
}

export function Skeleton({ count = 4 }) {
  return (
    <div>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton" />
      ))}
    </div>
  );
}