package com.aihub.hub.config;

import com.aihub.hub.logs.discovery.ContainerDiscoveryService;
import com.aihub.hub.logs.discovery.DiscoveryMode;
import com.aihub.hub.logs.discovery.LogsInterpreterProperties;
import com.aihub.hub.logs.discovery.impl.DockerContainerDiscoveryService;
import com.aihub.hub.logs.discovery.impl.MockContainerDiscoveryService;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

@Configuration
@EnableConfigurationProperties(LogsInterpreterProperties.class)
public class LogsInterpreterConfig {

    @Bean
    public ContainerDiscoveryService containerDiscoveryService(
        LogsInterpreterProperties properties,
        Clock clock
    ) {
        if (properties.getDiscovery().getMode() == DiscoveryMode.DOCKER) {
            return new DockerContainerDiscoveryService(properties.getDiscovery().getDocker(), clock);
        }
        return new MockContainerDiscoveryService(clock);
    }
}
