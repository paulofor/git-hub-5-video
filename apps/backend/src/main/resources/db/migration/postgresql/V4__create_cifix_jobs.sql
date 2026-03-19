CREATE TABLE cifix_jobs (
    id SERIAL PRIMARY KEY,
    job_id VARCHAR(100) NOT NULL UNIQUE,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    branch VARCHAR(200) NOT NULL,
    commit_hash VARCHAR(100),
    task_description TEXT NOT NULL,
    test_command TEXT,
    status VARCHAR(60) NOT NULL,
    summary TEXT,
    changed_files TEXT,
    patch TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cifix_jobs_project ON cifix_jobs(project_id);
CREATE INDEX idx_cifix_jobs_created_at ON cifix_jobs(created_at);
