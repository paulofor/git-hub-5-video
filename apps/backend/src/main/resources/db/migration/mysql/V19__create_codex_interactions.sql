CREATE TABLE codex_interactions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    codex_request_id BIGINT NOT NULL,
    sandbox_interaction_id VARCHAR(191) NOT NULL,
    direction VARCHAR(16) NOT NULL,
    content LONGTEXT NOT NULL,
    token_count INT NULL,
    sequence INT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_codex_interactions_request FOREIGN KEY (codex_request_id) REFERENCES codex_requests (id)
);

CREATE UNIQUE INDEX uq_codex_interactions_sandbox_id ON codex_interactions (sandbox_interaction_id);
CREATE INDEX idx_codex_interactions_request_sequence ON codex_interactions (codex_request_id, sequence);
