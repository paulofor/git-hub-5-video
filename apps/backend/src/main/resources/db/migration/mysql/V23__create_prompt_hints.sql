CREATE TABLE prompt_hints (
    id BIGINT NOT NULL AUTO_INCREMENT,
    label VARCHAR(150) NOT NULL,
    phrase LONGTEXT NOT NULL,
    environment_id BIGINT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_prompt_hints_environment FOREIGN KEY (environment_id) REFERENCES environments(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_prompt_hints_environment ON prompt_hints(environment_id);
