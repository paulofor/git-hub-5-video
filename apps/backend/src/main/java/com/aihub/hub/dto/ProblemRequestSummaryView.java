package com.aihub.hub.dto;

import java.time.Instant;

public record ProblemRequestSummaryView(
    Long id,
    String environment,
    String model,
    String status,
    String prompt,
    String responseText,
    String userComment,
    String problemDescription,
    String resolutionDifficulty,
    Instant createdAt
) {
}
