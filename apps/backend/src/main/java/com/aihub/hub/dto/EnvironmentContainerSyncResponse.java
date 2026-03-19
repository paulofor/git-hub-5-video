package com.aihub.hub.dto;

import java.time.Instant;
import java.util.List;

public record EnvironmentContainerSyncResponse(
    String provider,
    Instant executedAt,
    int discovered,
    int saved,
    int skipped,
    List<EnvironmentContainerView> containers
) {
}
