CREATE TABLE environment_containers (
    id BIGSERIAL PRIMARY KEY,
    environment_id BIGINT NOT NULL REFERENCES environments (id) ON DELETE CASCADE,
    name VARCHAR(191) NOT NULL,
    container_identifier VARCHAR(191),
    ip_address VARCHAR(191) NOT NULL,
    port INTEGER NOT NULL,
    source VARCHAR(20) NOT NULL,
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uk_env_container_name_port ON environment_containers (environment_id, name, port);
CREATE INDEX idx_env_containers_environment ON environment_containers (environment_id);
