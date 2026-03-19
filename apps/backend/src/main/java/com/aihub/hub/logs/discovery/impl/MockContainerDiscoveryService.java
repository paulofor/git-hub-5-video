package com.aihub.hub.logs.discovery.impl;

import com.aihub.hub.domain.EnvironmentRecord;
import com.aihub.hub.logs.discovery.ContainerDiscoveryResult;
import com.aihub.hub.logs.discovery.ContainerDiscoveryService;
import com.aihub.hub.logs.discovery.DiscoveredContainer;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Random;

public class MockContainerDiscoveryService implements ContainerDiscoveryService {

    private final Clock clock;

    public MockContainerDiscoveryService(Clock clock) {
        this.clock = clock;
    }

    @Override
    public ContainerDiscoveryResult discover(EnvironmentRecord environment) {
        Instant executedAt = clock.instant();
        List<DiscoveredContainer> containers = buildMockContainers(environment);
        return new ContainerDiscoveryResult("mock", executedAt, containers);
    }

    private List<DiscoveredContainer> buildMockContainers(EnvironmentRecord environment) {
        String baseName = slugify(environment.getName());
        int seed = Math.abs(baseName.hashCode());
        Random random = new Random(seed);
        int containerCount = Math.max(2, Math.min(4, (seed % 5) + 1));
        List<DiscoveredContainer> containers = new ArrayList<>();
        for (int i = 0; i < containerCount; i++) {
            String name = baseName + "-svc-" + (i + 1);
            String ip = String.format(
                Locale.ROOT,
                "10.%d.%d.%d",
                (seed + i) % 250,
                Math.abs(seed / (i + 1)) % 200,
                10 + (i * 3 % 40)
            );
            int basePort = 8000 + (Math.abs(random.nextInt()) % 1000);
            List<Integer> ports = List.of(basePort);
            containers.add(new DiscoveredContainer(name, name, ip, ports));
        }
        return containers;
    }

    private String slugify(String value) {
        if (value == null || value.isBlank()) {
            return "environment";
        }
        String normalized = value.strip().toLowerCase(Locale.ROOT);
        return normalized.replaceAll("[^a-z0-9]+", "-").replaceAll("^-+|-+$", "");
    }
}
