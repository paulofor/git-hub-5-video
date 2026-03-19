CREATE TABLE pull_request_explanations (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    repo VARCHAR(255) NOT NULL,
    pr_number INT NOT NULL,
    explanation CLOB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pull_request_explanations_repo_pr ON pull_request_explanations(repo, pr_number);
