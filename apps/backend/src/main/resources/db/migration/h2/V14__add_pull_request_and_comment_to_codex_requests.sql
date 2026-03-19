ALTER TABLE codex_requests
    ADD COLUMN pull_request_url VARCHAR(500),
    ADD COLUMN user_comment TEXT;
