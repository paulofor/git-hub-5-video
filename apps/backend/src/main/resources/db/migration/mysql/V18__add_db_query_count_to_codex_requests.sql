ALTER TABLE codex_requests
    ADD COLUMN db_query_count INT DEFAULT 0;

UPDATE codex_requests
SET db_query_count = 0
WHERE db_query_count IS NULL;
