CREATE TABLE blueprints (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE,
    description TEXT,
    templates LONGTEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE projects (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    org VARCHAR(120) NOT NULL,
    repo VARCHAR(200) NOT NULL UNIQUE,
    blueprint_id BIGINT,
    is_private BOOLEAN NOT NULL DEFAULT TRUE,
    repo_url TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_projects_blueprint FOREIGN KEY (blueprint_id) REFERENCES blueprints(id)
);

CREATE TABLE events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    repo VARCHAR(200) NOT NULL,
    event_type VARCHAR(80) NOT NULL,
    delivery_id VARCHAR(100) NOT NULL,
    payload LONGTEXT NOT NULL,
    received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_events_repo ON events(repo);
CREATE INDEX idx_events_received_at ON events(received_at);

CREATE TABLE runs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    repo VARCHAR(200) NOT NULL,
    run_id BIGINT NOT NULL,
    attempt INT NOT NULL DEFAULT 1,
    status VARCHAR(60),
    conclusion VARCHAR(60),
    workflow_name VARCHAR(200),
    logs_url TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_runs UNIQUE (repo, run_id, attempt)
);
CREATE INDEX idx_runs_repo ON runs(repo);
CREATE INDEX idx_runs_created_at ON runs(created_at);

CREATE TABLE prompts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    repo VARCHAR(200) NOT NULL,
    run_id BIGINT,
    pr_number INT,
    model VARCHAR(100) NOT NULL,
    prompt LONGTEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_prompts_repo ON prompts(repo);

CREATE TABLE responses (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    prompt_id BIGINT,
    repo VARCHAR(200) NOT NULL,
    run_id BIGINT,
    pr_number INT,
    root_cause LONGTEXT,
    fix_plan LONGTEXT,
    unified_diff LONGTEXT,
    confidence DECIMAL(5,2),
    raw_response LONGTEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_responses_prompt FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE CASCADE
);
CREATE INDEX idx_responses_repo ON responses(repo);

CREATE TABLE summaries (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    repo VARCHAR(200),
    range_start DATE NOT NULL,
    range_end DATE NOT NULL,
    granularity VARCHAR(20) NOT NULL,
    content LONGTEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    actor VARCHAR(120) NOT NULL,
    action VARCHAR(120) NOT NULL,
    target VARCHAR(200),
    payload LONGTEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_audit_created_at ON audit_log(created_at);
