CREATE TABLE pull_request_explanations (
    id BIGSERIAL PRIMARY KEY,
    repo VARCHAR(255) NOT NULL,
    pr_number INTEGER NOT NULL,
    explanation TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pull_request_explanations_repo_pr ON pull_request_explanations(repo, pr_number);
