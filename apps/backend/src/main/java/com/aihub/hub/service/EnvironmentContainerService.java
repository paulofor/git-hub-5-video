package com.aihub.hub.service;

import com.aihub.hub.domain.EnvironmentContainerRecord;
import com.aihub.hub.domain.EnvironmentContainerSource;
import com.aihub.hub.domain.EnvironmentRecord;
import com.aihub.hub.dto.CreateEnvironmentContainerRequest;
import com.aihub.hub.dto.EnvironmentContainerSyncResponse;
import com.aihub.hub.dto.EnvironmentContainerView;
import com.aihub.hub.logs.discovery.ContainerDiscoveryException;
import com.aihub.hub.logs.discovery.ContainerDiscoveryResult;
import com.aihub.hub.logs.discovery.ContainerDiscoveryService;
import com.aihub.hub.logs.discovery.DiscoveredContainer;
import com.aihub.hub.repository.EnvironmentContainerRepository;
import com.aihub.hub.repository.EnvironmentRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Locale;

@Service
@Transactional
public class EnvironmentContainerService {

    private final EnvironmentRepository environmentRepository;
    private final EnvironmentContainerRepository containerRepository;
    private final ContainerDiscoveryService containerDiscoveryService;
    private final Clock clock;

    public EnvironmentContainerService(
        EnvironmentRepository environmentRepository,
        EnvironmentContainerRepository containerRepository,
        ContainerDiscoveryService containerDiscoveryService,
        Clock clock
    ) {
        this.environmentRepository = environmentRepository;
        this.containerRepository = containerRepository;
        this.containerDiscoveryService = containerDiscoveryService;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<EnvironmentContainerView> listContainers(Long environmentId) {
        ensureEnvironmentExists(environmentId);
        return containerRepository.findByEnvironmentIdOrderByNameAsc(environmentId)
            .stream()
            .map(EnvironmentContainerView::from)
            .toList();
    }

    public EnvironmentContainerView createManualContainer(Long environmentId, CreateEnvironmentContainerRequest request) {
        EnvironmentRecord environment = getEnvironment(environmentId);
        String normalizedName = request.name().trim();
        if (containerRepository.existsByEnvironmentIdAndNameIgnoreCaseAndPort(environmentId, normalizedName, request.port())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Já existe um container com esse nome e porta neste ambiente.");
        }

        EnvironmentContainerRecord record = new EnvironmentContainerRecord();
        record.setEnvironment(environment);
        record.setName(normalizedName);
        record.setIpAddress(request.ipAddress().trim());
        record.setPort(request.port());
        record.setSource(EnvironmentContainerSource.MANUAL);
        record.setLastSeenAt(clock.instant());
        EnvironmentContainerRecord saved = containerRepository.save(record);
        return EnvironmentContainerView.from(saved);
    }

    public void deleteContainer(Long environmentId, Long containerId) {
        EnvironmentContainerRecord record = containerRepository.findByIdAndEnvironmentId(containerId, environmentId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Container não encontrado para este ambiente."));
        containerRepository.delete(record);
    }

    public EnvironmentContainerSyncResponse refreshContainers(Long environmentId) {
        EnvironmentRecord environment = getEnvironment(environmentId);
        ContainerDiscoveryResult result;
        try {
            result = containerDiscoveryService.discover(environment);
        } catch (ContainerDiscoveryException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, ex.getMessage(), ex);
        }

        List<DiscoveredContainer> containers = result.containers();
        int discovered = containers.size();
        int saved = 0;
        int skipped = 0;

        containerRepository.deleteByEnvironmentIdAndSource(environmentId, EnvironmentContainerSource.DISCOVERED);
        Instant lastSeen = result.executedAt() != null ? result.executedAt() : clock.instant();

        for (DiscoveredContainer container : containers) {
            if (container.ports() == null || container.ports().isEmpty()) {
                skipped++;
                continue;
            }
            for (Integer port : container.ports()) {
                if (port == null) {
                    continue;
                }
                EnvironmentContainerRecord record = new EnvironmentContainerRecord();
                record.setEnvironment(environment);
                record.setName(resolveContainerName(container.name(), environment.getName()));
                record.setContainerIdentifier(container.runtimeId());
                record.setIpAddress(normalizeIp(container.ipAddress()));
                record.setPort(port);
                record.setSource(EnvironmentContainerSource.DISCOVERED);
                record.setLastSeenAt(lastSeen);
                containerRepository.save(record);
                saved++;
            }
        }

        List<EnvironmentContainerView> updatedList = containerRepository.findByEnvironmentIdOrderByNameAsc(environmentId)
            .stream()
            .map(EnvironmentContainerView::from)
            .toList();

        return new EnvironmentContainerSyncResponse(
            result.provider(),
            lastSeen,
            discovered,
            saved,
            skipped,
            updatedList
        );
    }

    private EnvironmentRecord getEnvironment(Long environmentId) {
        return environmentRepository.findById(environmentId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ambiente não encontrado."));
    }

    private void ensureEnvironmentExists(Long environmentId) {
        if (!environmentRepository.existsById(environmentId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Ambiente não encontrado.");
        }
    }

    private String normalizeIp(String value) {
        if (value == null || value.isBlank()) {
            return "127.0.0.1";
        }
        return value.trim();
    }

    private String resolveContainerName(String candidate, String environmentName) {
        if (candidate != null && !candidate.isBlank()) {
            return candidate;
        }
        String base = environmentName != null && !environmentName.isBlank() ? environmentName.trim() : "container";
        return base.toLowerCase(Locale.ROOT) + "-runtime";
    }
}
