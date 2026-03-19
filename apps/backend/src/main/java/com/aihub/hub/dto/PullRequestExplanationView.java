package com.aihub.hub.dto;

import com.aihub.hub.domain.PullRequestExplanationRecord;

import java.time.Instant;

public record PullRequestExplanationView(
    Long id,
    String repo,
    Integer prNumber,
    String explanation,
    Instant createdAt
) {
    public static PullRequestExplanationView from(PullRequestExplanationRecord record) {
        return new PullRequestExplanationView(
            record.getId(),
            record.getRepo(),
            record.getPrNumber(),
            record.getExplanation(),
            record.getCreatedAt()
        );
    }
}
