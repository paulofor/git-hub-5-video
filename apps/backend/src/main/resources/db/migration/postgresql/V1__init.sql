CREATE TABLE blueprints (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE,
    description TEXT,
    templates JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE projects (
    id SERIAL PRIMARY KEY,
    org VARCHAR(120) NOT NULL,
    repo VARCHAR(200) NOT NULL UNIQUE,
    blueprint_id INTEGER REFERENCES blueprints(id),
    is_private BOOLEAN NOT NULL DEFAULT TRUE,
    repo_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE events (
    id SERIAL PRIMARY KEY,
    repo VARCHAR(200) NOT NULL,
    event_type VARCHAR(80) NOT NULL,
    delivery_id VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_events_repo ON events(repo);
CREATE INDEX idx_events_received_at ON events(received_at);

CREATE TABLE runs (
    id SERIAL PRIMARY KEY,
    repo VARCHAR(200) NOT NULL,
    run_id BIGINT NOT NULL,
    attempt INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(60),
    conclusion VARCHAR(60),
    workflow_name VARCHAR(200),
    logs_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(repo, run_id, attempt)
);
CREATE INDEX idx_runs_repo ON runs(repo);
CREATE INDEX idx_runs_created_at ON runs(created_at);

CREATE TABLE prompts (
    id SERIAL PRIMARY KEY,
    repo VARCHAR(200) NOT NULL,
    run_id BIGINT,
    pr_number INTEGER,
    model VARCHAR(100) NOT NULL,
    prompt TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_prompts_repo ON prompts(repo);

CREATE TABLE responses (
    id SERIAL PRIMARY KEY,
    prompt_id INTEGER REFERENCES prompts(id) ON DELETE CASCADE,
    repo VARCHAR(200) NOT NULL,
    run_id BIGINT,
    pr_number INTEGER,
    root_cause TEXT,
    fix_plan TEXT,
    unified_diff TEXT,
    confidence NUMERIC(5,2),
    raw_response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_responses_repo ON responses(repo);

CREATE TABLE summaries (
    id SERIAL PRIMARY KEY,
    repo VARCHAR(200),
    range_start DATE NOT NULL,
    range_end DATE NOT NULL,
    granularity VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    actor VARCHAR(120) NOT NULL,
    action VARCHAR(120) NOT NULL,
    target VARCHAR(200),
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_created_at ON audit_log(created_at);
