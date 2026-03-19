CREATE TABLE codex_model_pricing (
    id BIGSERIAL PRIMARY KEY,
    model_name VARCHAR(191) NOT NULL,
    display_name VARCHAR(191),
    input_price_per_million NUMERIC(19,6) NOT NULL,
    cached_input_price_per_million NUMERIC(19,6) NOT NULL,
    output_price_per_million NUMERIC(19,6) NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE,
    CONSTRAINT uk_codex_model_pricing_model_name UNIQUE (model_name)
);

ALTER TABLE codex_requests
    ADD COLUMN cached_prompt_tokens INTEGER,
    ADD COLUMN prompt_cost NUMERIC(19,6),
    ADD COLUMN cached_prompt_cost NUMERIC(19,6),
    ADD COLUMN completion_cost NUMERIC(19,6);
