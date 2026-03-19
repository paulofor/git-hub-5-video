ALTER TABLE codex_requests
    ADD COLUMN http_get_success_count INT DEFAULT 0;

UPDATE codex_requests
SET http_get_success_count = 0
WHERE http_get_success_count IS NULL;

CREATE TABLE codex_http_requests (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    codex_request_id BIGINT NOT NULL,
    sandbox_job_id VARCHAR(255) NOT NULL,
    sandbox_call_id VARCHAR(255) NOT NULL,
    tool_name VARCHAR(64),
    url TEXT NOT NULL,
    status_code INT,
    success BOOLEAN,
    requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_codex_http_requests_request FOREIGN KEY (codex_request_id) REFERENCES codex_requests(id),
    CONSTRAINT uq_codex_http_requests_job_call UNIQUE (sandbox_job_id, sandbox_call_id)
);

CREATE INDEX idx_codex_http_requests_request ON codex_http_requests (codex_request_id);
