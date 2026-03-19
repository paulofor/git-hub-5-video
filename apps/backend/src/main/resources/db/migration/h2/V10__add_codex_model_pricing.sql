CREATE TABLE codex_model_pricing (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    model_name VARCHAR(191) NOT NULL,
    display_name VARCHAR(191),
    input_price_per_million DECIMAL(19,6) NOT NULL,
    cached_input_price_per_million DECIMAL(19,6) NOT NULL,
    output_price_per_million DECIMAL(19,6) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL,
    CONSTRAINT uk_codex_model_pricing_model_name UNIQUE (model_name)
);

ALTER TABLE codex_requests
    ADD COLUMN cached_prompt_tokens INT,
    ADD COLUMN prompt_cost DECIMAL(19,6),
    ADD COLUMN cached_prompt_cost DECIMAL(19,6),
    ADD COLUMN completion_cost DECIMAL(19,6);
