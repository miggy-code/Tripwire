CREATE TABLE IF NOT EXISTS companies (
 id text PRIMARY KEY,
 payload jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS observations (
 id text PRIMARY KEY,
 company_id text NOT NULL REFERENCES companies(id),
 source text NOT NULL,
 board_slug text NOT NULL,
 source_id text NOT NULL,
 content_hash text NOT NULL,
 current boolean NOT NULL DEFAULT true,
 first_seen timestamptz NOT NULL,
 observed_at timestamptz NOT NULL,
 last_seen timestamptz NOT NULL,
 payload jsonb NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS observation_one_current ON observations(company_id,source,board_slug,source_id) WHERE current;
CREATE INDEX IF NOT EXISTS observation_current_time ON observations(observed_at DESC) WHERE current;
CREATE TABLE IF NOT EXISTS collection_checks (
 id bigserial PRIMARY KEY,
 run_id uuid NOT NULL,
 company_id text NOT NULL REFERENCES companies(id),
 source text NOT NULL,
 board_slug text NOT NULL,
 status text NOT NULL CHECK(status IN ('success','failure')),
 checked_at timestamptz NOT NULL,
 jobs_observed integer,
 error text
);
CREATE INDEX IF NOT EXISTS check_board_time ON collection_checks(company_id,source,board_slug,checked_at DESC);
CREATE TABLE IF NOT EXISTS collection_runs (
 id uuid PRIMARY KEY,
 started_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 status text NOT NULL CHECK(status IN ('running','success','partial','failure')),
 successful_boards integer NOT NULL DEFAULT 0,
 failed_boards integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS feedback (
 tenant_id text NOT NULL,
 user_id text NOT NULL,
 opportunity_id text NOT NULL,
 label text NOT NULL CHECK(label IN ('relevant','irrelevant')),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,user_id,opportunity_id)
);
