ALTER TABLE codex_requests
    ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    ADD COLUMN rating INT,
    ADD COLUMN started_at DATETIME(6),
    ADD COLUMN finished_at DATETIME(6),
    ADD COLUMN duration_ms BIGINT,
    ADD COLUMN timeout_count INT;

UPDATE codex_requests SET status = COALESCE(status, 'PENDING');

ALTER TABLE codex_requests
    MODIFY status VARCHAR(32) NOT NULL;
