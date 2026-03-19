package com.aihub.hub.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public class CodexModelPricingRequest {

    @NotBlank
    private String modelName;

    private String displayName;

    @NotNull
    @DecimalMin(value = "0.0", inclusive = true)
    @Digits(integer = 13, fraction = 6)
    private BigDecimal inputPricePerMillion;

    @NotNull
    @DecimalMin(value = "0.0", inclusive = true)
    @Digits(integer = 13, fraction = 6)
    private BigDecimal cachedInputPricePerMillion;

    @NotNull
    @DecimalMin(value = "0.0", inclusive = true)
    @Digits(integer = 13, fraction = 6)
    private BigDecimal outputPricePerMillion;

    public CodexModelPricingRequest() {
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
}
