ALTER TABLE problems
    ADD COLUMN total_cost DECIMAL(19,6) NOT NULL DEFAULT 0;

ALTER TABLE codex_requests
    ADD COLUMN problem_id BIGINT NULL,
    ADD COLUMN problem_cost_contribution DECIMAL(19,6) NOT NULL DEFAULT 0;

UPDATE problems
    SET total_cost = 0
    WHERE total_cost IS NULL;

UPDATE codex_requests
    SET problem_cost_contribution = 0
    WHERE problem_cost_contribution IS NULL;

ALTER TABLE codex_requests
    ADD CONSTRAINT fk_codex_requests_problem FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE SET NULL;

CREATE INDEX idx_codex_requests_problem ON codex_requests(problem_id);
