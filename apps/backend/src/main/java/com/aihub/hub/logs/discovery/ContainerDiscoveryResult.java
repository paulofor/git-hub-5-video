package com.aihub.hub.logs.discovery;

import java.time.Instant;
import java.util.List;

public record ContainerDiscoveryResult(
    String provider,
    Instant executedAt,
    List<DiscoveredContainer> containers
) {
}
