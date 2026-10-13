import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getBuildStatus, listBuilds, stopBuild } from '../api.js';
import {
  buildStatusOf,
  formatDuration,
  formatTime,
  isBuildActive,
  shortRef,
  shortSha,
} from '../constants.js';
import { Dialog, Empty, Skeleton } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { useRepo } from '../App.jsx';

/** 单个 stage 一行：状态点 + 名称 + 耗时 */
function StageRow({ stage }) {
  const s = buildStatusOf(stage.status);
  return (
    <div className="listrow">
      <div className="grow">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className={`tag ${s.tone} dot`}>{s.label}</span>
          <span style={{ fontWeight: 600 }}>{stage.name || stage.id}</span>
        </div>
        {Number(stage.duration) > 0 && (
          <div className="mono" style={{ marginTop: 3 }}>
            {formatDuration(stage.duration)}
          </div>
        )}
      </div>
    </div>
  );
}

/** 一条流水线：头部状态 + 展开它的 stage 列表 */
function PipelineBlock({ pipeline }) {
  const s = buildStatusOf(pipeline.status);
  const stages = Array.isArray(pipeline.stages) ? pipeline.stages : [];
  const labels = Array.isArray(pipeline.labels) ? pipeline.labels : [];

  return (
    <div className="detail-section" style={{ marginTop: 10 }}>
      <div className="section-head">
        <span>{pipeline.name || pipeline.id || '流水线'}</span>
        <span className={`tag ${s.tone} dot`}>{s.label}</span>
      </div>
      {Number(pipeline.duration) > 0 && (
        <div className="kv">
          <span className="k">耗时</span>
          <span className="v mono">{formatDuration(pipeline.duration)}</span>
        </div>
      )}
      {labels.length > 0 && (
        <div className="kv">
          <span className="k">规格</span>
          <span className="v mono">
            {labels.map((l) => `${l.key}=${(l.value || []).join('|')}`).join('  ')}
          </span>
        </div>
      )}
      {stages.length > 0 ? (
        stages.map((st) => <StageRow key={st.id || st.name} stage={st} />)
      ) : (
        <div className="center-note" style={{ padding: 12 }}>
          暂无阶段信息
        </div>
      )}
    </div>
  );
}

export default function BuildDetail() {
  const { sn } = useParams();
  const { repo } = useRepo();
  const nav = useNavigate();
  const toast = useToast();
  const repoPath = repo?.path;

  const [build, setBuild] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [askStop, setAskStop] = useState(false);
  const [busy, setBusy] = useState(false);

  // 构建的元信息（标题、分支、提交）只在列表接口里，按 sn 精确捞一条回来
  const loadMeta = useCallback(async () => {
    const res = await listBuilds(repoPath, { sn, page: 1, page_size: 1 });
    const list = Array.isArray(res) ? res : res?.data || [];
    return list[0] || null;
  }, [repoPath, sn]);

  const loadStatus = useCallback(async () => {
    try {
      return await getBuildStatus(repoPath, sn);
    } catch {
      // 构建刚触发、status 接口尚未就绪属常见情况，静默降级为空
      return null;
    }
  }, [repoPath, sn]);

  const load = useCallback(async () => {
    if (!repoPath) return;
    setLoading(true);
    setError('');
    try {
      const [meta, st] = await Promise.all([loadMeta(), loadStatus()]);
      if (!meta && !st) throw new Error('构建不存在或已被清理');
      setBuild(meta);
      setStatus(st);
    } catch (e) {
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [repoPath, loadMeta, loadStatus]);

  useEffect(() => {
    load();
  }, [load]);

  // 进行中的构建轮询，拿到终态后自动停
  const active = isBuildActive(status?.status || build?.status);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(loadStatus, 4000);
    return () => clearInterval(timer);
  }, [active, loadStatus]);

  const doStop = async () => {
    setBusy(true);
    try {
      await stopBuild(repoPath, sn);
      setAskStop(false);
      toast('已请求停止构建', 'ok');
      load();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  if (!repoPath) return <div className="center-note">请先选择仓库</div>;
  if (loading && !build && !status) {
    return (
      <div style={{ paddingTop: 60 }}>
        <Skeleton count={4} />
      </div>
    );
  }
  if (error && !build && !status) return <div className="error-box">{error}</div>;
  if (!build && !status) return <Empty ico="🛠️" text="构建不存在" />;

  const cur = status?.status || build?.status;
  const s = buildStatusOf(cur);
  const pipelines = Object.values(status?.pipelinesStatus || {});

  return (
    <>
      <div className="appbar-row" style={{ borderBottom: '1px solid var(--line-soft)' }}>
        <button className="iconbtn" onClick={() => nav(-1)} aria-label="返回">
          ‹
        </button>
        <div className="appbar-title mono" style={{ fontSize: 14 }}>
          {sn}
        </div>
        <span style={{ width: 44 }} />
      </div>

      <div className="detail-section">
        <div className="detail-title">{build?.title || build?.commitTitle || sn}</div>
        <div className="detail-sub">
          <span className={`tag ${s.tone} dot`}>
            {s.ico} {s.label}
          </span>
          {build?.event && <span className="tag">{build.event}</span>}
          {active && <span className="tag badge-checking">自动刷新中</span>}
        </div>

        <div className="branchline" style={{ padding: '0 14px 4px' }}>
          <span className="mono">{shortSha(build?.sha || '—')}</span>
          {build?.sourceRef && (
            <>
              <span className="arrow">·</span>
              <span className="mono">{shortRef(build.sourceRef)}</span>
            </>
          )}
          {build?.targetRef && build.targetRef !== build.sourceRef && (
            <>
              <span className="arrow">→</span>
              <span className="mono">{shortRef(build.targetRef)}</span>
            </>
          )}
        </div>

        <div className="section-head">
          <span>概况</span>
        </div>
        {build?.commitTitle && (
          <div className="kv">
            <span className="k">提交</span>
            <span className="v">{build.commitTitle}</span>
          </div>
        )}
        <div className="kv">
          <span className="k">触发人</span>
          <span className="v">{build?.nickName || build?.userName || '—'}</span>
        </div>
        <div className="kv">
          <span className="k">耗时</span>
          <span className="v mono">{formatDuration(build?.duration)}</span>
        </div>
        <div className="kv">
          <span className="k">触发时间</span>
          <span className="v">{formatTime(build?.createTime)}</span>
        </div>
        <div className="kv">
          <span className="k">流水线</span>
          <span className="v">
            {build ? `${build.pipelineSuccessCount || 0}/${build.pipelineTotalCount || 0} 成功` : '—'}
            {build?.pipelineFailCount > 0 ? `，${build.pipelineFailCount} 失败` : ''}
          </span>
        </div>
        {build?.buildLogUrl && (
          <div className="kv">
            <span className="k">日志</span>
            <span className="v">
              <a href={build.buildLogUrl} target="_blank" rel="noreferrer">
                在 CNB 查看完整日志 ↗
              </a>
            </span>
          </div>
        )}
        {status?.npc?.name && (
          <div className="kv">
            <span className="k">NPC</span>
            <span className="v">
              {status.npc.name}
              {status.npc.workMode ? '（工作模式）' : '（只读）'}
            </span>
          </div>
        )}
      </div>

      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn" onClick={load} disabled={busy}>
          刷新
        </button>
        <button
          className="btn btn-danger"
          onClick={() => setAskStop(true)}
          disabled={busy || !active}
        >
          {active ? '停止构建' : '已结束'}
        </button>
      </div>

      {active && (
        <div className="center-note" style={{ padding: '10px 16px' }}>
          构建进行中，页面每 4 秒自动刷新一次
        </div>
      )}

      {pipelines.length > 0 ? (
        pipelines.map((p) => <PipelineBlock key={p.id} pipeline={p} />)
      ) : (
        <div className="detail-section" style={{ marginTop: 12 }}>
          <Empty ico="🧩" text="暂无流水线阶段信息" />
        </div>
      )}

      {askStop && (
        <Dialog
          title="停止构建"
          confirmText="确认停止"
          tone="danger"
          onCancel={() => setAskStop(false)}
          onConfirm={doStop}
        >
          停止后本次构建会立即中断，已完成的步骤不会回滚，确定吗？
        </Dialog>
      )}
    </>
  );
}
