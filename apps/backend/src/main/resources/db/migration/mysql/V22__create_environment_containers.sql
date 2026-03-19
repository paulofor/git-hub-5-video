CREATE TABLE environment_containers (
    id BIGINT NOT NULL AUTO_INCREMENT,
    environment_id BIGINT NOT NULL,
    name VARCHAR(191) NOT NULL,
    container_identifier VARCHAR(191) NULL,
    ip_address VARCHAR(191) NOT NULL,
    port INT NOT NULL,
    source VARCHAR(20) NOT NULL,
    last_seen_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_environment_containers_environment FOREIGN KEY (environment_id)
        REFERENCES environments (id)
        ON DELETE CASCADE,
    UNIQUE KEY uk_env_container_name_port (environment_id, name, port),
    KEY idx_env_containers_environment (environment_id)
) ENGINE=InnoDB;
