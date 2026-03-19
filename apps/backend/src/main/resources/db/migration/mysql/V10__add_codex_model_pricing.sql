CREATE TABLE codex_model_pricing (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    model_name VARCHAR(191) NOT NULL,
    display_name VARCHAR(191) NULL,
    input_price_per_million DECIMAL(19,6) NOT NULL,
    cached_input_price_per_million DECIMAL(19,6) NOT NULL,
    output_price_per_million DECIMAL(19,6) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uk_codex_model_pricing_model_name UNIQUE (model_name)
);

ALTER TABLE codex_requests
    ADD COLUMN cached_prompt_tokens INT NULL,
    ADD COLUMN prompt_cost DECIMAL(19,6) NULL,
    ADD COLUMN cached_prompt_cost DECIMAL(19,6) NULL,
    ADD COLUMN completion_cost DECIMAL(19,6) NULL;
