# Tripwire

Tripwire turns evidence from public company job listings into a reviewable feed for practical discovery. It collects postings from verified company career boards, preserves source history, and evaluates the evidence against reusable use-case profiles. Each result includes the source listing, matching excerpt, and a question to investigate.

Matches are prompts for human review. They do not show that a company wants to buy, and the literal rules have not been calibrated against labeled outcomes.

## How it works

```text
Verified public job boards → PostgreSQL observations and history → versioned profiles → review feed and CSV
```

The app uses Next.js, PostgreSQL, and Clerk. Collection currently supports Ashby and Greenhouse, with verified boards in `config/companies.json`. A Lever collector is implemented and unit-tested, but there is no verified Lever board in the seed configuration. Company-to-board mappings are manually verified; Tripwire does not automatically resolve company identities or ingest SEC Form D filings.

The included versioned profiles cover **AI automation** and **technology modernization**. Profiles define evidence terms, exclusions, suggestions, and discovery questions in `profiles/`. Collection is shared across profiles. PostgreSQL retains observations and changes, while per-board collection checks report source health. Failed source requests do not erase existing observations.

The public homepage previews a limited set of source-backed matches. A signed-in workspace provides the protected feed, relevance feedback, and CSV export. Clerk user and optional organization identity define workspace access. Feedback is scoped to a user within a workspace; collected public postings form a shared catalog.

## Requirements

- Node.js 24 or later
- PostgreSQL 15 or later
- A Clerk application with sign-in enabled; Organizations are optional

## Local setup

1. Install dependencies and create a private environment file:

   ```sh
   npm ci
   cp .env.example .env.local
   ```

2. Create a PostgreSQL database and set `DATABASE_URL` in `.env.local`. Set `APP_URL` to the origin you use locally.
3. Add the publishable and secret keys from your own Clerk application. Keep `.env.local` private and out of version control. Enable Organizations in Clerk if you want team workspaces; organization selection is optional.
4. Apply the schema, collect an initial snapshot, and start the app:

   ```sh
   npm run db:migrate
   npm run collect
   npm run dev
   ```

5. In a second terminal, start recurring collection:

   ```sh
   npm run worker
   ```

The worker uses `COLLECTION_INTERVAL_MINUTES` (360 by default). Collection can also be triggered by an allowlisted Clerk operator or by an external scheduler using the protected cron endpoint. Set a strong `CRON_SECRET` before using external scheduling.

## Configuration

All supported environment variables are listed in `.env.example`.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `APP_URL` | Application origin used for same-origin write checks |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| `CLERK_SECRET_KEY` | Clerk server-side secret key |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Set to `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Set to `/sign-up` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | Set to `/workspace` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | Set to `/workspace` |
| `TRIPWIRE_ADMIN_USER_IDS` | Comma-separated Clerk user IDs allowed to trigger manual global collection |
| `CRON_SECRET` | Strong bearer secret for external scheduled collection |
| `COLLECTION_INTERVAL_MINUTES` | Worker interval in minutes; defaults to `360` |

Do not commit real keys or secrets. Ordinary organization membership does not grant global collection privileges.

## Routes and limits

- `/` shows a public preview; `/status` and `/api/health` expose collection status.
- `/workspace` requires a verified Clerk session.
- `/api/feed?profileId=...` returns the authenticated feed, capped at 200 cards per request.
- `/api/export?profileId=...` returns authenticated CSV, capped at 1,000 rows.
- `/api/feedback` accepts authenticated same-origin feedback; ownership is derived from the Clerk session.
- `/api/collect` accepts same-origin POST requests from an allowlisted operator; GET requests require a valid cron bearer token.

Profile evaluation currently examines at most the latest 10,000 active observations. Feed and export limits are explicit. Larger catalogs will need indexed or materialized profile evaluation and pagination.

## Development checks

```sh
npm test
npm run check
npm run build
```

PostgreSQL integration tests are skipped unless `TEST_DATABASE_URL` points to a separate database with a name ending in `_test`. The integration test migrates and clears that database. Unit tests use controlled fixtures and mocked source responses; passing tests do not establish matching accuracy or live source availability.

An opt-in Clerk verifier is available for development environments:

```sh
node --env-file=.env.local test/clerk-live.mjs
```

It refuses production keys and non-local app URLs. It creates temporary development identities and sessions, exercises authenticated routes and feedback isolation, then removes only the records it created. It does not verify interactive browser sign-in or organization switching.

## Deployment

The repository includes a Dockerfile and Compose configuration for the web app, PostgreSQL, migrations, and worker. The container path has not been run end-to-end, so treat it as a starting point and validate it in your environment. Before a public deployment, configure HTTPS, a production Clerk instance and domain, managed database backups and restore checks, worker supervision, and monitoring. Review each source provider’s access and redistribution terms.

## Current limits and roadmap

- Matching is deterministic literal-term evaluation. It can miss paraphrases or match context that needs human interpretation. Scores count matching rules; they are not buying probabilities.
- No labeled evaluation has established precision, recall, company-match accuracy, or buyer demand.
- SEC Form D ingestion, email delivery, and Clay integration are not implemented.
- No public deployment or production operations setup is included.

Near-term work is to validate both profiles against a labeled, held-out sample; expand verified board coverage; and prepare deployment operations. Form D context and delivery integrations can follow once their data and product requirements are established.

## Source documentation

- [Ashby public job postings API](https://developers.ashbyhq.com/docs/public-job-posting-api)
- [Greenhouse Job Board API](https://docs.greenhouse.io/job-board)
- [SEC Form D](https://www.sec.gov/files/FormD.pdf) (reference only; not ingested by Tripwire)
