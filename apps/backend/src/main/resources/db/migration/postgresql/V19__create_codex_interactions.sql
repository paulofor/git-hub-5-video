CREATE TABLE codex_interactions (
    id BIGSERIAL PRIMARY KEY,
    codex_request_id BIGINT NOT NULL REFERENCES codex_requests(id),
    sandbox_interaction_id VARCHAR(255) NOT NULL UNIQUE,
    direction VARCHAR(16) NOT NULL,
    content TEXT NOT NULL,
    token_count INTEGER,
    sequence INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_codex_interactions_request_sequence ON codex_interactions (codex_request_id, sequence);
