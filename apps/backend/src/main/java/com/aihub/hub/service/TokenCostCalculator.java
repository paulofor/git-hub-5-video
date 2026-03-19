package com.aihub.hub.service;

import com.aihub.hub.domain.CodexModelPricing;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Optional;

@Component
public class TokenCostCalculator {

    private static final BigDecimal MILLION = BigDecimal.valueOf(1_000_000L);

    private final CodexModelPricingService pricingService;

    public TokenCostCalculator(CodexModelPricingService pricingService) {
        this.pricingService = pricingService;
    }

    public TokenCostBreakdown calculate(
        String model,
        Integer inputTokens,
        Integer cachedInputTokens,
        Integer outputTokens,
        Integer totalTokens
    ) {
        Optional<CodexModelPricing> pricingOptional = pricingService.findByModelName(model);
        if (pricingOptional.isEmpty()) {
            return null;
        }

        CodexModelPricing pricing = pricingOptional.get();

        int inputCount = Optional.ofNullable(inputTokens).orElse(0);
        int cachedInputCount = Optional.ofNullable(cachedInputTokens).orElse(0);
        int outputCount = Optional.ofNullable(outputTokens).orElse(0);

        Integer resolvedTotal = totalTokens;
        if (resolvedTotal == null) {
            resolvedTotal = inputCount + cachedInputCount + outputCount;
        } else {
            int known = inputCount + cachedInputCount + outputCount;
            if (known == 0) {
                outputCount = resolvedTotal;
            } else if (known < resolvedTotal && outputCount == 0) {
                outputCount = Math.max(resolvedTotal - (inputCount + cachedInputCount), 0);
            }
        }

        BigDecimal inputCost = costForTokens(pricing.getInputPricePerMillion(), inputCount);
        BigDecimal cachedInputCost = costForTokens(pricing.getCachedInputPricePerMillion(), cachedInputCount);
        BigDecimal outputCost = costForTokens(pricing.getOutputPricePerMillion(), outputCount);
        BigDecimal totalCost = inputCost.add(cachedInputCost).add(outputCost);

        return new TokenCostBreakdown(
            inputCount,
            cachedInputCount,
            outputCount,
            resolvedTotal,
            inputCost,
            cachedInputCost,
            outputCost,
            totalCost
        );
    }

    private BigDecimal costForTokens(BigDecimal pricePerMillion, int tokens) {
        if (pricePerMillion == null || tokens <= 0) {
            return BigDecimal.ZERO.setScale(6, RoundingMode.HALF_UP);
        }
        return pricePerMillion
            .multiply(BigDecimal.valueOf(tokens))
            .divide(MILLION, 6, RoundingMode.HALF_UP);
    }
}
