import { getPublicHealth } from '../../src/repository.js';

export const dynamic = 'force-dynamic';

function asCount(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? value : 0; }

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
      <p className="eyebrow">Public collection status</p>
      <h1 id="status-title">Source checks</h1>
      <p className="intro-copy">These are collection counts, not claims about platform-wide uptime or matching accuracy.</p>
      <div className="status-grid" aria-label="Collection health summary">
        <Stat value={successful} label="successful checks" />
        <Stat value={failed} label="failed checks" failed={failed > 0} />
        <Stat value={fresh} label="fresh sources" />
        <Stat value={stale} label="stale sources" failed={stale > 0} />
      </div>
      <p className="status-note">Matching accuracy has not been evaluated. No hand-labeled benchmark has been published yet.</p>
      <p className="status-note">{reportTime ? `Last reported ${reportTime}` : 'No collection checks have been reported yet.'}</p>
    </section>
  );
}

function Stat({ value, label, failed = false }: { value: number; label: string; failed?: boolean }) {
  return <div className={`status-stat${failed ? ' attention' : ''}`}><strong>{value}</strong><span>{label}</span></div>;
}
