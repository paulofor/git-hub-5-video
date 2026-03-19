package com.aihub.hub.dto;

import java.time.Instant;

public record PromptHintView(
    Long id,
    String label,
    String phrase,
    Long environmentId,
    String environmentName,
    Instant createdAt,
    Instant updatedAt
) {
}
