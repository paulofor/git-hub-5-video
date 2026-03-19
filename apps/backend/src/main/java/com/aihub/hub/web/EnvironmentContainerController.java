package com.aihub.hub.web;

import com.aihub.hub.dto.CreateEnvironmentContainerRequest;
import com.aihub.hub.dto.EnvironmentContainerSyncResponse;
import com.aihub.hub.dto.EnvironmentContainerView;
import com.aihub.hub.service.EnvironmentContainerService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/environments/{environmentId}/containers")
public class EnvironmentContainerController {

    private final EnvironmentContainerService containerService;

    public EnvironmentContainerController(EnvironmentContainerService containerService) {
        this.containerService = containerService;
    }

    @GetMapping
    public List<EnvironmentContainerView> listContainers(@PathVariable Long environmentId) {
        return containerService.listContainers(environmentId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public EnvironmentContainerView createContainer(
        @PathVariable Long environmentId,
        @Valid @RequestBody CreateEnvironmentContainerRequest request
    ) {
        return containerService.createManualContainer(environmentId, request);
    }

    @DeleteMapping("/{containerId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteContainer(@PathVariable Long environmentId, @PathVariable Long containerId) {
        containerService.deleteContainer(environmentId, containerId);
    }

    @PostMapping("/discover")
    public EnvironmentContainerSyncResponse discoverContainers(@PathVariable Long environmentId) {
        return containerService.refreshContainers(environmentId);
    }
}
