package com.aihub.hub.logs.discovery.impl;

import com.aihub.hub.domain.EnvironmentRecord;
import com.aihub.hub.logs.discovery.ContainerDiscoveryException;
import com.aihub.hub.logs.discovery.ContainerDiscoveryResult;
import com.aihub.hub.logs.discovery.ContainerDiscoveryService;
import com.aihub.hub.logs.discovery.DiscoveredContainer;
import com.aihub.hub.logs.discovery.LogsInterpreterProperties;
import com.github.dockerjava.api.DockerClient;
import com.github.dockerjava.api.command.InspectContainerResponse;
import com.github.dockerjava.api.model.Container;
import com.github.dockerjava.api.model.ContainerNetwork;
import com.github.dockerjava.api.model.ContainerPort;
import com.github.dockerjava.api.model.Ports;
import com.github.dockerjava.core.DefaultDockerClientConfig;
import com.github.dockerjava.core.DockerClientImpl;
import com.github.dockerjava.transport.DockerHttpClient;
import com.github.dockerjava.httpclient5.ApacheDockerHttpClient;
import jakarta.annotation.PreDestroy;
import org.springframework.util.StringUtils;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

public class DockerContainerDiscoveryService implements ContainerDiscoveryService {

    private final LogsInterpreterProperties.Docker dockerProperties;
    private final DockerClient dockerClient;
    private final DockerHttpClient httpClient;
    private final Clock clock;

    public DockerContainerDiscoveryService(LogsInterpreterProperties.Docker dockerProperties, Clock clock) {
        this.dockerProperties = dockerProperties;
        this.clock = clock;
        DefaultDockerClientConfig.Builder configBuilder = DefaultDockerClientConfig.createDefaultConfigBuilder();
        if (StringUtils.hasText(dockerProperties.getHost())) {
            configBuilder = configBuilder.withDockerHost(dockerProperties.getHost());
        }
        if (dockerProperties.isTlsVerify()) {
            configBuilder = configBuilder.withDockerTlsVerify(true);
        }
        if (StringUtils.hasText(dockerProperties.getCertPath())) {
            configBuilder = configBuilder.withDockerCertPath(dockerProperties.getCertPath());
        }
        DefaultDockerClientConfig config = configBuilder.build();
        this.httpClient = new ApacheDockerHttpClient.Builder()
            .dockerHost(config.getDockerHost())
            .sslConfig(config.getSSLConfig())
            .maxConnections(100)
            .build();
        this.dockerClient = DockerClientImpl.getInstance(config, httpClient);
    }

    @Override
    public ContainerDiscoveryResult discover(EnvironmentRecord environment) {
        try {
            List<Container> containers = dockerClient.listContainersCmd()
                .withShowAll(true)
                .exec();
            List<DiscoveredContainer> discovered = new ArrayList<>();
            for (Container container : containers) {
                if (!matchesEnvironment(container, environment)) {
                    continue;
                }
                InspectContainerResponse inspect = dockerClient.inspectContainerCmd(container.getId()).exec();
                String ipAddress = resolveIpAddress(inspect);
                List<Integer> ports = resolvePorts(inspect, container);
                discovered.add(new DiscoveredContainer(resolveName(container), container.getId(), ipAddress, ports));
            }
            Instant executedAt = clock.instant();
            return new ContainerDiscoveryResult("docker", executedAt, discovered);
        } catch (Exception ex) {
            throw new ContainerDiscoveryException("Não foi possível consultar o daemon Docker: " + ex.getMessage(), ex);
        }
    }

    private boolean matchesEnvironment(Container container, EnvironmentRecord environment) {
        String labelKey = dockerProperties.getEnvironmentLabel();
        if (!StringUtils.hasText(labelKey)) {
            return true;
        }
        Map<String, String> labels = container.getLabels();
        if (labels == null || labels.isEmpty()) {
            return false;
        }
        String expected = environment.getName() != null ? environment.getName().trim() : "";
        if (!StringUtils.hasText(expected)) {
            return false;
        }
        String labelValue = labels.get(labelKey);
        return labelValue != null && labelValue.trim().equalsIgnoreCase(expected);
    }

    private String resolveName(Container container) {
        if (container.getNames() != null && container.getNames().length > 0) {
            String raw = container.getNames()[0];
            if (StringUtils.hasText(raw)) {
                return raw.replaceFirst("^/+", "");
            }
        }
        return container.getId().substring(0, Math.min(12, container.getId().length()));
    }

    private String resolveIpAddress(InspectContainerResponse inspect) {
        if (inspect.getNetworkSettings() != null) {
            Map<String, ContainerNetwork> networks = inspect.getNetworkSettings().getNetworks();
            if (networks != null && !networks.isEmpty()) {
                for (ContainerNetwork network : networks.values()) {
                    if (network != null && StringUtils.hasText(network.getIpAddress())) {
                        return network.getIpAddress();
                    }
                }
            }
            if (StringUtils.hasText(inspect.getNetworkSettings().getIpAddress())) {
                return inspect.getNetworkSettings().getIpAddress();
            }
        }
        return "127.0.0.1";
    }

    private List<Integer> resolvePorts(InspectContainerResponse inspect, Container container) {
        LinkedHashSet<Integer> ports = new LinkedHashSet<>();
        Ports bindings = inspect.getNetworkSettings() != null ? inspect.getNetworkSettings().getPorts() : null;
        if (bindings != null && bindings.getBindings() != null) {
            bindings.getBindings().forEach((exposedPort, bindingArray) -> {
                if (bindingArray != null && bindingArray.length > 0) {
                    for (Ports.Binding binding : bindingArray) {
                        if (binding == null) {
                            continue;
                        }
                        String hostPort = binding.getHostPortSpec();
                        if (StringUtils.hasText(hostPort)) {
                            try {
                                ports.add(Integer.parseInt(hostPort));
                            } catch (NumberFormatException ignored) {
                                // ignore binding that cannot be parsed
                            }
                        }
                    }
                } else if (exposedPort != null) {
                    ports.add(exposedPort.getPort());
                }
            });
        }
        if (ports.isEmpty() && container.getPorts() != null) {
            for (ContainerPort port : container.getPorts()) {
                if (port == null) {
                    continue;
                }
                if (port.getPublicPort() != null) {
                    ports.add(port.getPublicPort());
                } else if (port.getPrivatePort() != null) {
                    ports.add(port.getPrivatePort());
                }
            }
        }
        return new ArrayList<>(ports);
    }

    @PreDestroy
    public void destroy() {
        try {
            dockerClient.close();
        } catch (Exception ignored) {
            // no-op
        }
        try {
            httpClient.close();
        } catch (Exception ignored) {
            // no-op
        }
    }
}
