import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  deleteWorkspace,
  getWorkspaceDetail,
  listWorkspaces,
  startWorkspace,
  stopWorkspace,
} from '../api.js';
import { WORKSPACE_STATE, formatWorkspaceDuration, formatTime, shortSha } from '../constants.js';
import { Dialog } from '../components/ui.jsx';
import { ErrorBox } from '../components/ErrorBox.jsx';
import { useToast } from '../components/Toast.jsx';

/**
 * 云原生开发环境详情。
 *
 * 数据来源两处：
 *   1) /workspace/list 里那条，给出状态、备份等元信息（按 slug + sn 匹配）；
 *   2) /{repo}/-/workspace/detail/{sn}，给出 WebIDE / SSH / 各客户端连接地址。
 * 列表拿不到时（如环境已被回收）仍尝试取详情，失败只影响地址展示。
 *
 * 路径参数自带仓库（slug），因此本页不依赖顶部选中的仓库，链接可直接分享。
 */
export default function WorkspaceDetail() {
  const { slug, sn } = useParams();
  const nav = useNavigate();
  const toast = useToast();

  const [ws, setWs] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(null); // 'stop' | 'delete'

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setWs(null);
    setDetail(null);

    // 详情接口是主路径；列表是补充，用来显示状态与备份
    const [detailRes, listRes] = await Promise.allSettled([
      getWorkspaceDetail(slug, sn),
      listWorkspaces({ slug, page: 1, page_size: 100 }),
    ]);

    if (listRes.status === 'fulfilled') {
      const list = Array.isArray(listRes.value?.list) ? listRes.value.list : [];
      setWs(list.find((w) => w.sn === sn) || null);
    }

    if (detailRes.status === 'fulfilled') {
      setDetail(detailRes.value || {});
    } else {
      setError(detailRes.reason?.message || '加载失败');
    }
    setLoading(false);
  }, [slug, sn]);

  useEffect(() => {
    load();
  }, [load]);

  const doStop = async () => {
    setBusy(true);
    try {
      await stopWorkspace(sn);
      toast('已请求停止，稍后刷新查看状态', 'ok');
      setAsk(null);
      load();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      await deleteWorkspace(sn);
      toast('开发环境已删除', 'ok');
      setAsk(null);
      nav('/workspaces', { replace: true });
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const doStart = async () => {
    setBusy(true);
    try {
      const res = await startWorkspace(slug, ws?.branch ? { branch: ws.branch } : {});
      if (res?.url) window.open(res.url, '_blank', 'noopener');
      toast(res?.message || '已打开环境', 'ok');
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="center-note" style={{ paddingTop: 60 }}>加载中…</div>;

  const state = WORKSPACE_STATE[ws?.status] || null;
  const links = buildLinks(detail);

  return (
    <>
      <div className="appbar-row" style={{ borderBottom: '1px solid var(--line-soft)' }}>
        <button className="iconbtn" onClick={() => nav(-1)} aria-label="返回">
          ‹
        </button>
        <div className="appbar-title">开发环境</div>
        <button className="iconbtn" onClick={load} disabled={busy} aria-label="刷新">
          ⟳
        </button>
      </div>

      <div className="detail-section">
        <div className="detail-title mono" style={{ fontSize: 17 }}>
          {slug}
        </div>
        <div className="detail-sub">
          {state ? (
            <span className={`tag ${state.tone} dot`}>{state.label}</span>
          ) : (
            <span className="tag">状态未知</span>
          )}
          <span className="mono">SN {sn}</span>
        </div>

        {error && <ErrorBox error={error} onRetry={load} />}

        <div className="section-head">
          <span>环境信息</span>
        </div>
        <div className="kv">
          <span className="k">分支</span>
          <span className="v mono">{ws?.branch || '—'}</span>
        </div>
        <div className="kv">
          <span className="k">提交</span>
          <span className="v mono">{ws?.latest_sha ? shortSha(ws.latest_sha) : '—'}</span>
        </div>
        <div className="kv">
          <span className="k">创建</span>
          <span className="v">{formatTime(ws?.create_time) || '—'}</span>
        </div>
        {ws?.duration > 0 && (
          <div className="kv">
            <span className="k">存活</span>
            <span className="v">{formatWorkspaceDuration(ws.duration)}</span>
          </div>
        )}
        <div className="kv">
          <span className="k">SSH</span>
          <span className="v">{ws?.ssh ? '支持' : '不支持'}</span>
        </div>
        {ws?.workspace && (
          <div className="kv">
            <span className="k">工作区</span>
            <span className="v mono">{ws.workspace}</span>
          </div>
        )}
        {ws?.status === 'closed' && (
          <div className="kv">
            <span className="k">备份</span>
            <span className="v">
              {ws.file_count || 0} 文件 / {ws.commit_count || 0} 提交 /{' '}
              {ws.remote_stash_count || 0} stash
              {ws.restore_id ? '（已恢复）' : ''}
            </span>
          </div>
        )}

        <div className="section-head">
          <span>连接方式</span>
        </div>
        {links.length ? (
          links.map((l) => (
            <div key={l.label} className="kv">
              <span className="k" style={{ width: 96 }}>
                {l.label}
              </span>
              <span className="v mono" style={{ wordBreak: 'break-all' }}>
                {l.value}
              </span>
              <button className="btn btn-sm" onClick={() => copy(l.value, l.label, toast)}>
                复制
              </button>
            </div>
          ))
        ) : (
          <div className="kv">
            <span className="v" style={{ color: 'var(--fg-faint)' }}>
              暂无可用的连接地址
            </span>
          </div>
        )}

        <div className="section-head">
          <span>操作</span>
        </div>
        <div className="listrow" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={doStart} disabled={busy}>
            启动 / 打开
          </button>
          <button className="btn" onClick={() => setAsk('stop')} disabled={busy}>
            停止
          </button>
          <button className="btn btn-danger" onClick={() => setAsk('delete')} disabled={busy}>
            删除
          </button>
        </div>
      </div>

      {ask === 'stop' && (
        <Dialog
          title="停止开发环境"
          confirmText="确认停止"
          onCancel={() => setAsk(null)}
          onConfirm={doStop}
        >
          停止后环境会被回收，未提交的改动依赖自动备份恢复，确定吗？
        </Dialog>
      )}
      {ask === 'delete' && (
        <Dialog
          title="删除开发环境"
          confirmText="确认删除"
          tone="danger"
          onCancel={() => setAsk(null)}
          onConfirm={doDelete}
        >
          删除后环境及其关联资源（含代码备份）将一并清除，不可恢复，确定吗？
        </Dialog>
      )}
    </>
  );
}

async function copy(value, label, toast) {
  try {
    await navigator.clipboard.writeText(value);
    toast(`${label} 已复制`, 'ok');
  } catch {
    toast('复制失败，请长按选择文本', 'err');
  }
}

/** 从详情接口里挑出可用的连接地址，按常用程度排序 */
function buildLinks(detail) {
  if (!detail) return [];
  const rows = [
    ['WebIDE', detail.webide],
    ['CodeBuddy Web', detail.codebuddyweb],
    ['SSH', detail.ssh],
    ['Remote SSH', detail.remoteSsh],
    ['VS Code', detail.vscode],
    ['Cursor', detail.cursor],
    ['CodeBuddy（国际）', detail.codebuddy],
    ['CodeBuddy（国内）', detail.codebuddycn],
    ['JetBrains', detail.jetbrains?.gateway || Object.values(detail.jetbrains || {})[0]],
    ['Trae', detail.trae],
    ['Trae（国内）', detail['trae-cn']],
    ['Zed', detail.zed],
  ];
  return rows
    .filter(([, v]) => typeof v === 'string' && v.trim())
    .map(([label, value]) => ({ label, value: value.trim() }));
}
