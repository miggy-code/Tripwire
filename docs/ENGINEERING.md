# Engineering notes

## API contracts

- `/` serves a public preview of 20 results. `/workspace` requires a Clerk session.
- `/api/feed?profileId=...` returns up to 200 authenticated results.
- `/api/export?profileId=...` exports up to 1,000 authenticated CSV rows.
- `/api/feedback` accepts authenticated same-origin feedback; tenant and user identity come from the verified session.
- `/api/collect` accepts operator-allowlisted same-origin POST requests. Scheduled GET requests require a valid bearer token configured through `CRON_SECRET` (at least 32 characters).
- `/status` and `/api/health` report collection health.

Evaluation currently examines the latest 10,000 active observations. Pagination and materialized evaluation are planned for larger catalogs.

## Matching semantics

Profiles use deterministic term matching and context exclusions. Scores count matching rules; they do not represent purchase probabilities. Profile precision has not yet been measured against a labeled evaluation set. Public health reports evaluation availability explicitly.

Company mappings are manually verified from career pages. The configured live catalog uses Ashby and Greenhouse; the Lever adapter has unit-test coverage but no live-verified seed board.

## Verification

The automated suite covers collector responses, profile behavior, persistence, and access controls. Database integration checks require a dedicated `_test` database. The opt-in `test/clerk-live.mjs` creates temporary development identities and sessions, verifies protected routes and feedback isolation, and cleans up its own records. Interactive browser sign-in, sign-out, and organization switching require separate acceptance checks.

## Runtime configuration

See `.env.example` for environment variables. `TRIPWIRE_ADMIN_USER_IDS` is a comma-separated operator allowlist. Ordinary organization membership does not grant global collection privileges. `COLLECTION_INTERVAL_MINUTES` defaults to 360.

The Dockerfile and `compose.yaml` define web, database, migration, and worker services. Container orchestration has not yet been verified end to end. Production rollout requires HTTPS, production Clerk keys and domain configuration, database backups with restore verification, worker supervision, and health/error alerts. The current verified runtime is local; a public deployment is a release task.

## Roadmap

See [the implementation plan](PLAN.md). Planned extensions include SEC Form D ingestion and identity resolution, email delivery, Clay integration, automated board discovery, and user-facing profile configuration.
