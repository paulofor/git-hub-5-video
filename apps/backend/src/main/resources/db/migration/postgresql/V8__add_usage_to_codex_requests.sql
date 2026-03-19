ALTER TABLE codex_requests
    ADD COLUMN prompt_tokens INTEGER,
    ADD COLUMN completion_tokens INTEGER,
    ADD COLUMN total_tokens INTEGER,
    ADD COLUMN cost NUMERIC(19,6);
