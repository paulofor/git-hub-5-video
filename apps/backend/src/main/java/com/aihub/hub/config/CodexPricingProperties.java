package com.aihub.hub.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;

@Component
@ConfigurationProperties(prefix = "hub.codex.pricing")
public class CodexPricingProperties {

    private Map<String, ModelPricing> models = new HashMap<>();

    public Map<String, ModelPricing> getModels() {
        return models;
    }

    public void setModels(Map<String, ModelPricing> models) {
        this.models = models;
    }

    public ModelPricing getPricingFor(String model) {
        if (model == null) {
            return null;
        }
        return models.get(model);
    }

    public static class ModelPricing {
        private BigDecimal input;
        private BigDecimal cachedInput;
        private BigDecimal output;

        public BigDecimal getInput() {
            return input;
        }

        public void setInput(BigDecimal input) {
            this.input = input;
        }

        public BigDecimal getCachedInput() {
            return cachedInput;
        }

        public void setCachedInput(BigDecimal cachedInput) {
            this.cachedInput = cachedInput;
        }

        public BigDecimal getOutput() {
            return output;
        }

        public void setOutput(BigDecimal output) {
            this.output = output;
        }
    }
}
