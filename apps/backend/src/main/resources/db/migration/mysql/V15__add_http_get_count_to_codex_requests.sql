ALTER TABLE codex_requests
    ADD COLUMN http_get_count INT DEFAULT 0;

UPDATE codex_requests
SET http_get_count = 0
WHERE http_get_count IS NULL;
