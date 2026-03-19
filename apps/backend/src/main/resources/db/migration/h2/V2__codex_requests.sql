CREATE TABLE codex_requests (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    environment VARCHAR(150) NOT NULL,
    model VARCHAR(150) NOT NULL,
    prompt LONGTEXT NOT NULL,
    response_text LONGTEXT,
    external_id VARCHAR(120),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_codex_requests_created_at ON codex_requests(created_at);
