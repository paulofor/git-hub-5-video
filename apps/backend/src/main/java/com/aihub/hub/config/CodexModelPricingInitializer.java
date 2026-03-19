package com.aihub.hub.config;

import com.aihub.hub.domain.CodexModelPricing;
import com.aihub.hub.repository.CodexModelPricingRepository;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;

@Component
public class CodexModelPricingInitializer {

    private static final Logger log = LoggerFactory.getLogger(CodexModelPricingInitializer.class);

    private final CodexPricingProperties pricingProperties;
    private final CodexModelPricingRepository repository;

    public CodexModelPricingInitializer(
        CodexPricingProperties pricingProperties,
        CodexModelPricingRepository repository
    ) {
        this.pricingProperties = pricingProperties;
        this.repository = repository;
    }

    @PostConstruct
    public void initialize() {
        pricingProperties.getModels().forEach((modelName, pricing) -> {
            if (!StringUtils.hasText(modelName) || pricing == null) {
                return;
            }

            repository.findByModelNameIgnoreCase(modelName)
                .ifPresentOrElse(existing -> {
                    if (existing.getDisplayName() == null) {
                        existing.setDisplayName(modelName.trim());
                        repository.save(existing);
                    }
                }, () -> {
                    CodexModelPricing entity = new CodexModelPricing();
                    entity.setModelName(modelName.trim());
                    entity.setDisplayName(modelName.trim());
                    entity.setInputPricePerMillion(defaultValue(pricing.getInput()));
                    entity.setCachedInputPricePerMillion(defaultValue(pricing.getCachedInput()));
                    entity.setOutputPricePerMillion(defaultValue(pricing.getOutput()));
                    repository.save(entity);
                    log.info("Modelo de pricing '{}' inicializado a partir da configuração", modelName);
                });
        });
    }

    private BigDecimal defaultValue(BigDecimal value) {
        return value != null ? value : BigDecimal.ZERO;
    }
}
