package com.aihub.hub.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

public record ProblemSummaryView(
    Long id,
    String title,
    LocalDate includedAt,
    BigDecimal totalCost
) {
}
