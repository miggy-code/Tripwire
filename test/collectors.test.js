import assert from 'node:assert/strict';
import test from 'node:test';
import { collectCompany, normalizeText } from '../src/collectors.js';

const company = (source = 'greenhouse') => ({ id: 'example', name: 'Example', domain: 'example.com', verified: true, boards: [{ source, slug: 'example' }] });
const response = (body, { ok = true, status = 200 } = {}) => ({ ok, status, json: async () => body });

test('normalizes complete Greenhouse HTML including doubly encoded entities', async () => {
  const events = await collectCompany(company(), {
    now: '2026-10-23T00:00:00.000Z',
    fetchImpl: async () => response({ jobs: [{ id: 42, title: 'Operations &amp; Systems', content: '&lt;p&gt;Own&nbsp;weekly reporting.&lt;/p&gt;<p>Connect Salesforce &amp;amp; finance.</p>', absolute_url: 'https://example.com/jobs/42', updated_at: '2026-10-22T12:00:00Z' }] }),
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].text, 'Own weekly reporting.\nConnect Salesforce & finance.');
  assert.equal(events[0].title, 'Operations & Systems');
  assert.equal(events[0].sourceUpdatedAt, '2026-10-22T12:00:00.000Z');
  assert.equal(events.health[0].status, 'success');
});

test('retries a transient server response with bounded attempts', async () => {
  let calls = 0;
  const events = await collectCompany(company(), {
    fetchImpl: async () => {
      calls += 1;
      return calls === 1 ? response({}, { ok: false, status: 503 }) : response({ jobs: [{ id: 1, title: 'Role', content: 'A complete description', absolute_url: 'https://example.com/1' }] });
    },
  });
  assert.equal(calls, 2);
  assert.equal(events.health[0].status, 'success');
});

test('uses Lever public postings and preserves its source dates', async () => {
  const events = await collectCompany(company('lever'), {
    now: '2026-10-23T00:00:00.000Z',
    fetchImpl: async () => response([{ id: 'lever-1', text: 'Integration Engineer', descriptionPlain: 'Own integration program delivery.', additionalPlain: 'Work with customer systems.', lists: [{ content: '<p>Document migration risks.</p>' }], hostedUrl: 'https://jobs.lever.co/example/1', createdAt: 1761177600000, updatedAt: 1761264000000 }]),
  });
  assert.equal(events[0].source, 'lever');
  assert.equal(events[0].text, 'Own integration program delivery.\n\nWork with customer systems.\n\nDocument migration risks.');
  assert.equal(events[0].sourcePublishedAt, '2025-10-23T00:00:00.000Z');
  assert.equal(events[0].sourceUpdatedAt, '2025-10-24T00:00:00.000Z');
});

test('marks malformed source data as a board failure, not an empty board', async () => {
  const events = await collectCompany(company(), { fetchImpl: async () => response({ jobs: [null] }) });
  assert.equal(events.length, 0);
  assert.equal(events.health[0].status, 'failure');
  assert.match(events.health[0].error, /Unexpected job schema/);
});

test('normalizes numeric entities without losing literal text', () => {
  assert.equal(normalizeText('<p>Modernize &#x26; migrate &#169;</p>'), 'Modernize & migrate ©');
});
