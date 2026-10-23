# Tripwire implementation plan

## Product

A shared evidence engine for reviewable public company changes, with built-in configurable profiles. Initial use cases are AI operations automation and technology modernization. Source evidence supports discovery questions; it does not establish intent to buy.

## Architecture

Verified company job boards → PostgreSQL observations/history → versioned profiles → review feed and CSV → relevance feedback.

- Next.js application with public evidence preview and protected workspace routes.
- Clerk session verification, optional organization workspaces and user-scoped feedback.
- PostgreSQL migrations, per-board transactions and advisory collection locking.
- Ashby and Greenhouse collectors with verified seed mappings; Lever adapter is unit-tested but has no live-verified seed.
- Exact source excerpts, separate observation/publication/update timestamps and explicit baseline snapshots.
- Recurring worker, health reporting, operator controls and cron authentication.

## Implemented phases

1. Evidence collection: bounded retries/timeouts, durable observations, edit history, duplicate detection, removal handling and failure-safe retention.
2. Reusable profiles: versioned JSON rules, sentence-level exclusions, source-backed excerpts and configurable discovery questions.
3. Review product: responsive public preview, authenticated feed, CSV export, feedback, collection health and Clerk IAM.
4. Engineering verification: deterministic tests, isolated PostgreSQL integration checks, opt-in live Clerk session checks, production build and CI workflow.

## Production release gates

- Configure production Clerk/domain and verify complete browser login/logout and organization switching with separate users.
- Select hosting, configure HTTPS and managed production database, and verify backup restoration.
- Exercise container deployment end to end; supervise the worker and configure health/error alerts.
- Hand-label at least 100 records, keep an untouched evaluation sample, and publish profile-specific precision/coverage with sample dates and uncertainty.
- Validate repeat use and useful decisions with pilot users.
- Review source access and redistribution terms.

## Explicit limits

The evaluator examines the latest 10,000 active observations. The public preview returns 20 cards, authenticated feed defaults to 200, and CSV exports are capped at 1,000. Larger catalogs require pagination and materialized/indexed evaluation.

Company mappings are manually verified. Literal relevance rules are uncalibrated and can miss context. Matching scores are rule counts, not purchase probabilities.

## Deferred

SEC Form D ingestion and name-to-domain resolution, automated board discovery, email delivery, Clay-specific integration, user-facing profile management and an executable plugin SDK. Add funding context without conflating filing dates with funding dates, offered amounts with sold amounts, or amendments with new financing.

## Verification

Run `npm test`, `npm run check` and `npm run build`. Set `TEST_DATABASE_URL` to an isolated database whose name ends in `_test` to run database integration tests. The opt-in `test/clerk-live.mjs` requires development keys and a running local app; it creates and cleans only its own test identities and feedback. Never interpret temporary test users as product adoption.
