ALTER TABLE codex_requests
    ADD COLUMN prompt_tokens INT,
    ADD COLUMN completion_tokens INT,
    ADD COLUMN total_tokens INT,
    ADD COLUMN cost DECIMAL(19,6);
