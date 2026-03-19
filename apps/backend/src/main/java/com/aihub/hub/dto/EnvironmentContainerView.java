package com.aihub.hub.dto;

import com.aihub.hub.domain.EnvironmentContainerRecord;
import com.aihub.hub.domain.EnvironmentContainerSource;

import java.time.Instant;

public record EnvironmentContainerView(
    Long id,
    Long environmentId,
    String name,
    String ipAddress,
    Integer port,
    EnvironmentContainerSource source,
    String containerIdentifier,
    Instant lastSeenAt,
    Instant createdAt,
    Instant updatedAt
) {
    public static EnvironmentContainerView from(EnvironmentContainerRecord record) {
        return new EnvironmentContainerView(
            record.getId(),
            record.getEnvironment().getId(),
            record.getName(),
            record.getIpAddress(),
            record.getPort(),
            record.getSource(),
            record.getContainerIdentifier(),
            record.getLastSeenAt(),
            record.getCreatedAt(),
            record.getUpdatedAt()
        );
    }
}
