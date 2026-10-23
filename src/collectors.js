const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
const NAMED_ENTITIES = { amp: '&', apos: "'", quot: '"', lt: '<', gt: '>', nbsp: ' ', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', copy: '©', reg: '®', trade: '™' };

function decodeEntities(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z][\da-z]+);/gi, (entity, token) => {
    const key = token.toLowerCase();
    if (key in NAMED_ENTITIES) return NAMED_ENTITIES[key];
    const codePoint = key.startsWith('#x') ? Number.parseInt(key.slice(2), 16) : key.startsWith('#') ? Number.parseInt(key.slice(1), 10) : NaN;
    return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff && (codePoint < 0xd800 || codePoint > 0xdfff) ? String.fromCodePoint(codePoint) : entity;
  });
}

/** Converts source HTML to a full readable quote. Handles Greenhouse double encoding. */
export function normalizeText(value) {
  let output = String(value ?? '');
  for (let pass = 0; pass < 2; pass += 1) output = decodeEntities(output);
  return output.replace(/<(?:br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi, '\n').replace(/<[^>]*>/g, ' ').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
}

function isoOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const shouldRetry = (error) => error?.retriable === true || error?.name === 'AbortError' || /network|fetch failed|timeout/i.test(error?.message ?? '');

async function getJson(url, fetchImpl) {
  let lastError;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, { signal: controller.signal, headers: { accept: 'application/json' } });
      if (!response?.ok) {
        const error = new Error(`HTTP ${response?.status ?? 'unknown'}`);
        error.retriable = response?.status === 429 || response?.status >= 500;
        throw error;
      }
      try { return await response.json(); } catch (error) { throw new Error(`Invalid JSON response: ${error.message}`); }
    } catch (error) {
      lastError = error;
      if (attempt + 1 >= MAX_ATTEMPTS || !shouldRetry(error)) throw error;
      await wait(250 * (2 ** attempt));
    } finally { clearTimeout(timer); }
  }
  throw lastError;
}

function candidate(company, board, job, now, fields) {
  if (!job || typeof job !== 'object' || Array.isArray(job)) throw new Error('Unexpected job schema: job must be an object');
  const result = { companyId: company.id, source: board.source, sourceId: String(job[fields.id] ?? ''), title: normalizeText(job[fields.title]), text: normalizeText(fields.text(job)), url: job[fields.url] ?? null, firstSeen: now, lastSeen: now, sourcePublishedAt: null, sourceUpdatedAt: null, demo: false, boardSlug: board.slug };
  if (!result.sourceId || !result.title || !result.text) throw new Error('Unexpected job schema: job id, title, and description are required');
  return result;
}

async function collectAshby(company, board, options) {
  const body = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board.slug)}?includeCompensation=false`, options.fetchImpl);
  if (!body || !Array.isArray(body.jobs)) throw new Error('Unexpected Ashby response schema: expected jobs array');
  return body.jobs.filter((job) => job?.isListed !== false).map((job) => {
    const result = candidate(company, board, job, options.now, { id: 'id', title: 'title', text: (value) => value.descriptionPlain ?? value.descriptionHtml ?? value.description, url: 'jobUrl' });
    result.sourcePublishedAt = isoOrNull(job.publishedAt);
    return result;
  });
}

async function collectGreenhouse(company, board, options) {
  const body = await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board.slug)}/jobs?content=true`, options.fetchImpl);
  if (!body || !Array.isArray(body.jobs)) throw new Error('Unexpected Greenhouse response schema: expected jobs array');
  return body.jobs.map((job) => {
    const result = candidate(company, board, job, options.now, { id: 'id', title: 'title', text: (value) => value.content, url: 'absolute_url' });
    result.sourceUpdatedAt = isoOrNull(job.updated_at);
    return result;
  });
}

async function collectLever(company, board, options) {
  const body = await getJson(`https://api.lever.co/v0/postings/${encodeURIComponent(board.slug)}?mode=json`, options.fetchImpl);
  if (!Array.isArray(body)) throw new Error('Unexpected Lever response schema: expected array');
  return body.map((job) => {
    const result = candidate(company, board, job, options.now, {
      id: 'id', title: 'text', url: 'hostedUrl',
      text: (value) => [
        value.descriptionPlain ?? value.description,
        value.additionalPlain ?? value.additional,
        ...(Array.isArray(value.lists) ? value.lists.map((section) => section?.content ?? section?.text) : []),
      ].filter(Boolean).join('\n\n'),
    });
    result.sourcePublishedAt = isoOrNull(job.createdAt);
    result.sourceUpdatedAt = isoOrNull(job.updatedAt);
    return result;
  });
}

/** Collect public postings; failures are surfaced in .health and never interpreted as removals. */
export async function collectCompany(company, { fetchImpl = fetch, now = new Date().toISOString() } = {}) {
  if (!company?.verified || !company?.id || !Array.isArray(company.boards)) throw new Error('collectCompany requires a verified company with an id and boards array');
  const observedAt = isoOrNull(now) ?? new Date().toISOString();
  const supported = company.boards.filter((board) => board && ['ashby', 'greenhouse', 'lever'].includes(board.source) && board.slug);
  const settled = await Promise.allSettled(supported.map(async (board) => {
    const collect = board.source === 'ashby' ? collectAshby : board.source === 'greenhouse' ? collectGreenhouse : collectLever;
    return { board, jobs: await collect(company, board, { fetchImpl, now: observedAt }) };
  }));
  const events = [];
  const health = [];
  settled.forEach((result, index) => {
    const board = supported[index];
    if (result.status === 'fulfilled') {
      events.push(...result.value.jobs);
      health.push({ companyId: company.id, source: board.source, boardSlug: board.slug, status: 'success', checkedAt: observedAt, error: null, jobsObserved: result.value.jobs.length });
    } else health.push({ companyId: company.id, source: board.source, boardSlug: board.slug, status: 'failure', checkedAt: observedAt, error: result.reason?.message ?? 'Unknown collection failure', jobsObserved: null });
  });
  Object.defineProperty(events, 'health', { value: health, enumerable: false });
  return events;
}
