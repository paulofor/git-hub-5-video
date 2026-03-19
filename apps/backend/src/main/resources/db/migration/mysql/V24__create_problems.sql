CREATE TABLE problems (
    id BIGINT NOT NULL AUTO_INCREMENT,
    title VARCHAR(200) NOT NULL,
    description LONGTEXT NOT NULL,
    included_at DATE NOT NULL,
    environment_id BIGINT NULL,
    project_id BIGINT NULL,
    finalization_description LONGTEXT NULL,
    finalized_at DATE NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_problems_environment FOREIGN KEY (environment_id) REFERENCES environments(id) ON DELETE SET NULL,
    CONSTRAINT fk_problems_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE INDEX idx_problems_included_at ON problems(included_at);
CREATE INDEX idx_problems_environment ON problems(environment_id);
CREATE INDEX idx_problems_project ON problems(project_id);

CREATE TABLE problem_updates (
    id BIGINT NOT NULL AUTO_INCREMENT,
    problem_id BIGINT NOT NULL,
    entry_date DATE NOT NULL,
    description LONGTEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_problem_updates_problem FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_problem_updates_problem ON problem_updates(problem_id);
