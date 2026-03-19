ALTER TABLE codex_requests
    ADD COLUMN status VARCHAR(32) DEFAULT 'PENDING',
    ADD COLUMN rating INT,
    ADD COLUMN started_at TIMESTAMP,
    ADD COLUMN finished_at TIMESTAMP,
    ADD COLUMN duration_ms BIGINT,
    ADD COLUMN timeout_count INT;

UPDATE codex_requests SET status = COALESCE(status, 'PENDING');

ALTER TABLE codex_requests ALTER COLUMN status SET NOT NULL;
ALTER TABLE codex_requests ALTER COLUMN status DROP DEFAULT;
