import { getPublicHealth } from '../../src/repository.js';

export const dynamic = 'force-dynamic';

function asCount(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? value : 0; }
function formatTime(value: unknown) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return '—';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(new Date(value)) + ' UTC';
}

export default async function StatusPage() {
  const health: any = await getPublicHealth();
  const metrics = health?.metrics || {};
  const successful = asCount(metrics.successfulBoards);
  const failed = asCount(metrics.failedBoards);
  const stale = asCount(metrics.staleBoards);
  const fresh = Array.isArray(health?.checks)
    ? health.checks.filter((check: any) => check.status === 'success' && check.stale === false).length
    : 0;
  const checkedAt = health?.latestRun?.finishedAt
    || health?.checks?.map((check: any) => check.checkedAt).filter(Boolean).sort().at(-1)
    || health?.latestRun?.startedAt;
  const reportTime = checkedAt && !Number.isNaN(Date.parse(checkedAt))
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(checkedAt))
    : null;
  return (
    <section className="status-page" aria-labelledby="status-title">
      <p className="eyebrow">Collection status</p>
      <h1 id="status-title">Source availability,<br /><em>in plain view.</em></h1>
      <p className="intro-copy">Collection freshness and source availability across monitored boards.</p>
      <div className="status-grid" aria-label="Collection health summary">
        <Stat value={successful} label="successful checks" />
        <Stat value={failed} label="failed checks" failed={failed > 0} />
        <Stat value={fresh} label="fresh sources" />
        <Stat value={stale} label="stale sources" failed={stale > 0} />
      </div>
      <div className="status-detail-bar"><span>Matching benchmark <b>Pending evaluation</b></span><span>{reportTime ? `Last reported ${reportTime}` : 'No collection checks reported'}</span></div>
      {Array.isArray(health?.checks) && health.checks.length > 0 && <div className="source-table-wrap"><table className="source-table"><caption>Monitored source boards</caption><thead><tr><th scope="col">Board</th><th scope="col">Source</th><th scope="col">Last check</th><th scope="col">Records seen</th><th scope="col">State</th></tr></thead><tbody>{health.checks.map((check: any) => <tr key={`${check.companyId}-${check.source}-${check.boardSlug}`}><td>{check.boardSlug}</td><td>{check.source}</td><td>{formatTime(check.checkedAt)}</td><td>{typeof check.jobsObserved === 'number' ? check.jobsObserved : '—'}</td><td><span className={`table-state ${check.status === 'success' && !check.stale ? 'table-state--ready' : ''}`}>{check.status === 'success' ? (check.stale ? 'Stale' : 'Available') : 'Attention'}</span></td></tr>)}</tbody></table></div>}
    </section>
  );
}

function Stat({ value, label, failed = false }: { value: number; label: string; failed?: boolean }) {
  return <div className={`status-stat${failed ? ' attention' : ''}`}><strong>{value}</strong><span>{label}</span></div>;
}
