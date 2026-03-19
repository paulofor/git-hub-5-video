ALTER TABLE codex_requests ADD COLUMN profile VARCHAR(20) NOT NULL DEFAULT 'STANDARD';
UPDATE codex_requests SET profile = 'STANDARD' WHERE profile IS NULL;
