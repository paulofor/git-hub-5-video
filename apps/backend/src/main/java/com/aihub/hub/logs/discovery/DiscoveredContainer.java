package com.aihub.hub.logs.discovery;

import java.util.List;

public record DiscoveredContainer(
    String name,
    String runtimeId,
    String ipAddress,
    List<Integer> ports
) {
}
