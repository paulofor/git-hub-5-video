package com.aihub.hub.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(
    name = "codex_model_pricing",
    uniqueConstraints = {
        @UniqueConstraint(name = "uk_codex_model_pricing_model_name", columnNames = {"model_name"})
    }
)
public class CodexModelPricing {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "model_name", nullable = false, length = 191)
    private String modelName;

    @Column(name = "display_name", length = 191)
    private String displayName;

    @Column(name = "input_price_per_million", precision = 19, scale = 6, nullable = false)
    private BigDecimal inputPricePerMillion;

    @Column(name = "cached_input_price_per_million", precision = 19, scale = 6, nullable = false)
    private BigDecimal cachedInputPricePerMillion;

    @Column(name = "output_price_per_million", precision = 19, scale = 6, nullable = false)
    private BigDecimal outputPricePerMillion;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;

    @PrePersist
    void prePersist() {
        Instant now = Instant.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    @PreUpdate
    void preUpdate() {
        this.updatedAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public String getModelName() {
        return modelName;
    }

    public void setModelName(String modelName) {
        this.modelName = modelName;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public BigDecimal getInputPricePerMillion() {
        return inputPricePerMillion;
    }

    public void setInputPricePerMillion(BigDecimal inputPricePerMillion) {
        this.inputPricePerMillion = inputPricePerMillion;
    }

    public BigDecimal getCachedInputPricePerMillion() {
        return cachedInputPricePerMillion;
    }

    public void setCachedInputPricePerMillion(BigDecimal cachedInputPricePerMillion) {
        this.cachedInputPricePerMillion = cachedInputPricePerMillion;
    }

    public BigDecimal getOutputPricePerMillion() {
        return outputPricePerMillion;
    }

    public void setOutputPricePerMillion(BigDecimal outputPricePerMillion) {
        this.outputPricePerMillion = outputPricePerMillion;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
