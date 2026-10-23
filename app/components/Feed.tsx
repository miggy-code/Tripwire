'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type FeedProps = { initialFeed: any; authenticated?: boolean };

function safeSourceUrl(value: unknown) {
  if (typeof value !== 'string') return null;
  try { const url = new URL(value); return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null; } catch { return null; }
}
function date(value: unknown) {
  if (!value || typeof value !== 'string' || Number.isNaN(Date.parse(value))) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)) + ' UTC';
}
function preview(value: unknown, cap = 420) { const text = String(value || '').trim(); return text.length > cap ? `${text.slice(0, cap - 1).trimEnd()}…` : text; }

export default function Feed({ initialFeed, authenticated = false }: FeedProps) {
  const [profileId, setProfileId] = useState('');
  const [feed, setFeed] = useState(initialFeed);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState('');
  const initialFeedback = Array.isArray(initialFeed?.feedback) ? Object.fromEntries(initialFeed.feedback.map((item: any) => [item.opportunityId, item.label === 'relevant' ? 'Relevant' : 'Not relevant'])) : {};
  const [feedback, setFeedback] = useState<Record<string, string>>(initialFeedback);
  const request = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);
  useEffect(() => () => request.current?.abort(), []);
  const profiles = Array.isArray(feed?.profiles) ? feed.profiles : [];
  const allOpportunities = Array.isArray(feed?.opportunities) ? feed.opportunities : [];
  const opportunities = useMemo(() => profileId ? allOpportunities.filter((item: any) => item.profileId === profileId) : allOpportunities, [allOpportunities, profileId]);

  async function changeProfile(next: string) {
    setProfileId(next);
    if (!authenticated) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const version = ++requestVersion.current;
    setLoading(true);
    setRequestError('');
    try {
      const query = next ? `?profileId=${encodeURIComponent(next)}` : '';
      const response = await fetch(`/api/feed${query}`, { credentials: 'same-origin', signal: controller.signal });
      if (!response.ok) throw new Error('Unable to load profile');
      const nextFeed = await response.json();
      if (version === requestVersion.current) setFeed(nextFeed);
    } catch (error: any) {
      if (error?.name !== 'AbortError' && version === requestVersion.current) setRequestError('This profile could not be refreshed. Showing the last verified feed.');
    } finally { if (version === requestVersion.current) setLoading(false); }
  }
  async function sendFeedback(opportunityId: string, label: 'relevant' | 'irrelevant') {
    if (!authenticated) return;
    setFeedback((current) => ({ ...current, [opportunityId]: 'Saving…' }));
    try {
      const response = await fetch('/api/feedback', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ opportunityId, label }) });
      if (!response.ok) throw new Error('Unable to save feedback');
      setFeedback((current) => ({ ...current, [opportunityId]: 'Recorded' }));
    } catch { setFeedback((current) => ({ ...current, [opportunityId]: 'Could not save feedback' })); }
  }

  const metrics = feed?.metrics || {};
  const checks = Array.isArray(feed?.health) ? feed.health : [];
  const latestCheck = checks.map((check: any) => check.checkedAt).filter(Boolean).sort().at(-1);
  const successfulChecks = checks.filter((check: any) => check.status === 'success').length;
  return <section className="feed-section" aria-labelledby="feed-title" aria-busy={loading}>
    <div className="section-bar"><div><p className="eyebrow">{authenticated ? 'Workspace' : 'Public preview'}</p><h2 id="feed-title">Observed opportunities</h2></div><p className="count" aria-live="polite">{loading ? 'Refreshing…' : `${opportunities.length} shown`}</p></div>
    <div className="profile-row"><label htmlFor="profile-select">Use case</label><select id="profile-select" value={profileId} onChange={(event) => changeProfile(event.target.value)}><option value="">All profiles</option>{profiles.map((profile: any) => <option value={profile.id} key={profile.id}>{profile.name}{profile.version ? ` · v${profile.version}` : ''}</option>)}</select>{authenticated && <a className="export-link" href={profileId ? `/api/export?profileId=${encodeURIComponent(profileId)}` : '/api/export'}>Export CSV</a>}{!authenticated && <span className="public-note">Filter is applied to the loaded public preview.</span>}</div>
    {requestError && <p className="inline-error" role="status">{requestError}</p>}
    <dl className="feed-metrics"><div><dt>Companies</dt><dd>{typeof metrics.companies === 'number' ? metrics.companies : '—'}</dd></div><div><dt>Current observations</dt><dd>{typeof metrics.currentObservations === 'number' ? metrics.currentObservations : '—'}</dd></div><div><dt>Source coverage</dt><dd>{checks.length ? `${successfulChecks}/${checks.length} checks succeeded` : 'No checks reported'}</dd></div><div><dt>Latest source check</dt><dd>{latestCheck ? date(latestCheck) : 'Unavailable'}</dd></div></dl>
    {!opportunities.length ? <div className="empty-state"><h3>No observed opportunities yet.</h3><p>Connect verified company job boards and run collection to populate this review feed.</p></div> : <div className="feed-list">{opportunities.map((opportunity: any) => <Opportunity key={opportunity.id} opportunity={opportunity} authenticated={authenticated} feedback={feedback[opportunity.id]} onFeedback={sendFeedback} />)}</div>}
  </section>;
}

function Opportunity({ opportunity, authenticated, feedback, onFeedback }: { opportunity: any; authenticated: boolean; feedback?: string; onFeedback: (id: string, label: 'relevant' | 'irrelevant') => void }) {
  const company = opportunity.company || {};
  const event = opportunity.event || opportunity;
  const href = safeSourceUrl(event.url);
  return <article className="opportunity" aria-labelledby={`opportunity-${opportunity.id}`}>
    <aside className="opportunity-meta"><span className="source">{event.baseline ? 'Initial baseline observation' : (event.source || 'Public source')}</span>{event.baseline ? <span>Present when monitoring began<br /><b>{date(event.firstSeen)}</b></span> : <span>First observed<br /><b>{date(event.firstSeen)}</b></span>}<span>Last observed<br /><b>{date(event.lastSeen || event.versionObservedAt)}</b></span>{event.sourcePublishedAt && <span>Last published by source<br /><b>{date(event.sourcePublishedAt)}</b></span>}{event.sourceUpdatedAt && <span>Source updated<br /><b>{date(event.sourceUpdatedAt)}</b></span>}</aside>
    <div className="opportunity-body"><div className="company-line"><h3 id={`opportunity-${opportunity.id}`}>{company.name || 'Unknown company'}</h3>{company.domain && <span className="domain">{company.domain}</span>}{company.verified ? (safeSourceUrl(company.verificationUrl) ? <a className="verified" href={safeSourceUrl(company.verificationUrl) as string} target="_blank" rel="noopener noreferrer">Domain verified</a> : <span className="verified">Domain verified</span>) : <span className="unverified">Domain unknown</span>}</div>
      <p className="event-title">{href ? <a href={href} target="_blank" rel="noopener noreferrer">{event.title || opportunity.title || 'Source event'}</a> : (event.title || opportunity.title || 'Source event')}</p>
      {event.text && <p className="event-text">{preview(event.text)}</p>}
      <div className="evidence-list">{Array.isArray(opportunity.matches) && opportunity.matches.map((match: any, index: number) => <section className="evidence" key={match.ruleId || index}><p className="rule-label">{match.label || 'Source evidence'}</p>{match.excerpt && <blockquote>“{preview(match.excerpt, 300)}”</blockquote>}{match.suggestion && <p className="suggestion">{match.suggestion}</p>}{match.question && <p className="question"><strong>Question to investigate:</strong> {match.question}</p>}</section>)}</div>
      {authenticated ? <div className="feedback"><span>Relevant to this use case?</span><button onClick={() => onFeedback(opportunity.id, 'relevant')}>Yes</button><button onClick={() => onFeedback(opportunity.id, 'irrelevant')}>No</button>{feedback && <em>{feedback}</em>}</div> : <p className="review-note">Review the cited source before acting.</p>}
    </div>
  </article>;
}
