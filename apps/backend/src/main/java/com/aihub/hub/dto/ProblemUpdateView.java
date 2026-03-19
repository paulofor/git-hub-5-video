package com.aihub.hub.dto;

import java.time.Instant;
import java.time.LocalDate;

public record ProblemUpdateView(
    Long id,
    LocalDate entryDate,
    String description,
    Instant createdAt,
    Instant updatedAt
) {
}
