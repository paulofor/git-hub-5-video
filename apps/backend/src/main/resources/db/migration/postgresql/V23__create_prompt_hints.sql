CREATE TABLE prompt_hints (
    id BIGSERIAL PRIMARY KEY,
    label VARCHAR(150) NOT NULL,
    phrase TEXT NOT NULL,
    environment_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE prompt_hints
    ADD CONSTRAINT fk_prompt_hints_environment FOREIGN KEY (environment_id) REFERENCES environments(id) ON DELETE CASCADE;

CREATE INDEX idx_prompt_hints_environment ON prompt_hints(environment_id);
