import { Link } from 'react-router-dom';
import {
  PRIORITY_TONE,
  formatTime,
  shortRef,
  shortSha,
  MERGEABLE_STATE,
  buildStatusOf,
  formatDuration,
} from '../constants.js';

export function UserTag({ user, suffix }) {
  if (!user) return null;
  const name = user.nickname || user.username || '未知';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {user.avatar ? (
        <img className="avatar" src={user.avatar} alt="" />
      ) : (
        <span className="avatar" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'var(--fg-dim)' }}>
          {name.slice(0, 1)}
        </span>
      )}
      <span>{name}</span>
      {suffix}
    </span>
  );
}

export function StateBadge({ state }) {
  if (state === 'open') return <span className="tag badge-open dot">进行中</span>;
  if (state === 'merged') return <span className="tag badge-merged dot">已合并</span>;
  return <span className="tag badge-closed dot">已关闭</span>;
}

export function MergeStateBadge({ pull }) {
  if (pull.is_merged || pull.state === 'merged') {
    return <span className="tag badge-merged dot">已合并</span>;
  }
  const s = MERGEABLE_STATE[pull.mergeable_state];
  if (!s) return null;
  return <span className={`tag ${s.tone} dot`}>{s.label}</span>;
}

export function IssueCard({ issue }) {
  const closed = issue.state === 'closed';
  const tone = PRIORITY_TONE[issue.priority];
  return (
    <Link className="card" to={`/issues/${issue.number}`}>
      <div className="card-head">
        <div className={`card-title ${closed ? 'closed' : ''}`}>{issue.title}</div>
        <StateBadge state={issue.state} />
      </div>
      <div className="card-meta">
        {issue.priority && tone && (
          <span className="tag" style={{ color: tone, borderColor: 'transparent' }}>
            {issue.priority}
          </span>
        )}
        {(issue.labels || []).slice(0, 4).map((l) => (
          <span
            key={l.id || l.name}
            className="tag dot"
            style={l.color ? { color: l.color, borderColor: 'transparent' } : undefined}
          >
            {l.name}
          </span>
        ))}
        {(issue.labels || []).length > 4 && (
          <span className="tag">+{issue.labels.length - 4}</span>
        )}
      </div>
      <div className="card-meta">
        <UserTag user={issue.author} />
        <span className="sep">·</span>
        <span>{formatTime(issue.updated_at || issue.created_at)}</span>
        {issue.comment_count > 0 && (
          <>
            <span className="sep">·</span>
            <span>💬 {issue.comment_count}</span>
          </>
        )}
      </div>
    </Link>
  );
}

export function PullCard({ pull }) {
  const closed = pull.state === 'closed' && !pull.is_merged;
  return (
    <Link className="card" to={`/pulls/${pull.number}`}>
      <div className="card-head">
        <div className={`card-title ${closed ? 'closed' : ''}`}>{pull.title}</div>
        <MergeStateBadge pull={pull} />
      </div>
      {pull.is_wip && (
        <div className="card-meta">
          <span className="tag badge-wip">草稿 WIP</span>
        </div>
      )}
      <div className="branchline">
        <span>{shortRef(pull.head?.ref)}</span>
        <span className="arrow">→</span>
        <span>{shortRef(pull.base?.ref)}</span>
      </div>
      <div className="card-meta">
        <UserTag user={pull.author} />
        <span className="sep">·</span>
        <span>{formatTime(pull.updated_at || pull.created_at)}</span>
        {pull.comment_count > 0 && (
          <>
            <span className="sep">·</span>
            <span>💬 {pull.comment_count}</span>
          </>
        )}
        {pull.review_count > 0 && (
          <>
            <span className="sep">·</span>
            <span>👀 {pull.review_count}</span>
          </>
        )}
      </div>
    </Link>
  );
}

/** 构建状态徽章，列表与详情共用 */
export function BuildBadge({ status }) {
  const s = buildStatusOf(status);
  return (
    <span className={`tag ${s.tone} dot`}>
      {s.ico} {s.label}
    </span>
  );
}

export function BuildCard({ build }) {
  // 上游把「流水线成功/失败/总数」拆成三个字段，这里拼成 3/3 这种进度
  const total = build.pipelineTotalCount || 0;
  const ok = build.pipelineSuccessCount || 0;
  const fail = build.pipelineFailCount || 0;
  const shown = build.title || build.commitTitle || build.sn;

  return (
    <Link className="card" to={`/builds/${build.sn}`}>
      <div className="card-head">
        <div className="card-title">{shown}</div>
        <BuildBadge status={build.status} />
      </div>
      <div className="card-meta">
        <span className="mono">{shortSha(build.sha)}</span>
        {build.sourceRef && (
          <>
            <span className="sep">·</span>
            <span className="mono">{shortRef(build.sourceRef)}</span>
          </>
        )}
        <span className="sep">·</span>
        <span className="mono">{formatDuration(build.duration)}</span>
        {total > 0 && (
          <>
            <span className="sep">·</span>
            <span>
              {fail > 0 ? `✕ ${fail} ` : ''}
              {ok}/{total}
            </span>
          </>
        )}
      </div>
      <div className="card-meta">
        <UserTag user={{ nickname: build.nickName || build.userName }} />
        <span className="sep">·</span>
        <span>{formatTime(build.createTime)}</span>
        {build.event && (
          <>
            <span className="sep">·</span>
            <span className="mono">{build.event}</span>
          </>
        )}
      </div>
    </Link>
  );
}
