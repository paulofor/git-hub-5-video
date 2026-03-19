package com.aihub.hub.dto;

import com.aihub.hub.domain.EnvironmentRecord;

import java.time.Instant;

public record EnvironmentView(
    Long id,
    String name,
    String description,
    Instant createdAt,
    String dbHost,
    Integer dbPort,
    String dbName,
    String dbUser,
    String dbPassword
) {
    public static EnvironmentView from(EnvironmentRecord record) {
        return new EnvironmentView(
            record.getId(),
            record.getName(),
            record.getDescription(),
            record.getCreatedAt(),
            record.getDbHost(),
            record.getDbPort(),
            record.getDbName(),
            record.getDbUser(),
            record.getDbPassword()
        );
    }
}
