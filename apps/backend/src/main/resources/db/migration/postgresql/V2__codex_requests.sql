CREATE TABLE codex_requests (
    id BIGSERIAL PRIMARY KEY,
    environment VARCHAR(150) NOT NULL,
    model VARCHAR(150) NOT NULL,
    prompt TEXT NOT NULL,
    response_text TEXT,
    external_id VARCHAR(120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_codex_requests_created_at ON codex_requests(created_at);
