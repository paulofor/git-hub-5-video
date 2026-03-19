CREATE TABLE problems (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    included_at DATE NOT NULL,
    environment_id BIGINT,
    project_id BIGINT,
    finalization_description TEXT,
    finalized_at DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE problems
    ADD CONSTRAINT fk_problems_environment FOREIGN KEY (environment_id) REFERENCES environments(id) ON DELETE SET NULL;
ALTER TABLE problems
    ADD CONSTRAINT fk_problems_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX idx_problems_included_at ON problems(included_at);
CREATE INDEX idx_problems_environment ON problems(environment_id);
CREATE INDEX idx_problems_project ON problems(project_id);

CREATE TABLE problem_updates (
    id BIGSERIAL PRIMARY KEY,
    problem_id BIGINT NOT NULL,
    entry_date DATE NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE problem_updates
    ADD CONSTRAINT fk_problem_updates_problem FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE;

CREATE INDEX idx_problem_updates_problem ON problem_updates(problem_id);
