package com.aihub.hub.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public record ProblemView(
    Long id,
    String title,
    String description,
    LocalDate includedAt,
    Long environmentId,
    String environmentName,
    Long projectId,
    String projectName,
    BigDecimal totalCost,
    List<ProblemUpdateView> dailyUpdates,
    String finalizationDescription,
    LocalDate finalizedAt,
    Instant createdAt,
    Instant updatedAt
) {
}
