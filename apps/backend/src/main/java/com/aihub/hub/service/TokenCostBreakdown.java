package com.aihub.hub.service;

import java.math.BigDecimal;

public record TokenCostBreakdown(
    Integer inputTokens,
    Integer cachedInputTokens,
    Integer outputTokens,
    Integer totalTokens,
    BigDecimal inputCost,
    BigDecimal cachedInputCost,
    BigDecimal outputCost,
    BigDecimal totalCost
) {
}
