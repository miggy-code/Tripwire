import { getPublicHealth } from '../../src/repository.js';
import { getDb } from '../../src/db.js';

export const dynamic = 'force-dynamic';

function formatTime(value: unknown) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return 'Not yet refreshed';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(new Date(value)) + ' UTC';
}

export default async function CoveragePage() {
  const [health, catalog] = await Promise.all([
    getPublicHealth(),
    getDb().query(`SELECT c.id, c.payload->>'name' AS name, c.payload->>'domain' AS domain,
      count(o.id)::int AS roles FROM companies c
      LEFT JOIN observations o ON o.company_id=c.id AND o.current=true
      WHERE c.payload->>'active'='true'
      GROUP BY c.id ORDER BY lower(c.payload->>'name')`),
  ]);
  const checks = health.checks || [];
  const lastRefresh = checks.map((check: any) => check.lastSuccessAt).filter(Boolean).sort().at(-1);
  return (
    <section className="status-page" aria-labelledby="coverage-title">
      <p className="eyebrow">Data coverage</p>
      <h1 id="coverage-title">Know who<br /><em>you can discover.</em></h1>
      <p className="intro-copy">Explore the companies behind your feed and see when their job listings were last refreshed.</p>
      <div className="status-grid coverage-summary" aria-label="Data coverage summary">
        <div className="status-stat"><strong>{catalog.rows.length}</strong><span>Companies monitored</span></div>
        <div className="status-stat"><strong>{health.metrics.currentObservations.toLocaleString('en-US')}</strong><span>Roles indexed</span></div>
      </div>
      <div className="status-detail-bar"><span>Last refreshed <b>{formatTime(lastRefresh)}</b></span><a href="/">Explore signals ↗</a></div>
      <div className="source-table-wrap"><table className="source-table">
        <caption>Company coverage</caption>
        <thead><tr><th scope="col">Company</th><th scope="col">Website</th><th scope="col">Roles indexed</th><th scope="col">Last refreshed</th></tr></thead>
        <tbody>{catalog.rows.map((company: any) => {
          const refreshed = checks.filter((check: any) => check.companyId === company.id).map((check: any) => check.lastSuccessAt).filter(Boolean).sort().at(-1);
          return <tr key={company.id}><td>{company.name}</td><td>{company.domain}</td><td>{company.roles.toLocaleString('en-US')}</td><td>{formatTime(refreshed)}</td></tr>;
        })}</tbody>
      </table>{catalog.rows.length === 0 && <p className="status-note">Company coverage will appear after the first collection.</p>}</div>
    </section>
  );
}
