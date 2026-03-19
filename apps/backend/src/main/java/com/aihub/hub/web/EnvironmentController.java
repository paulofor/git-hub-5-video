package com.aihub.hub.web;

import com.aihub.hub.dto.CreateEnvironmentRequest;
import com.aihub.hub.dto.EnvironmentView;
import com.aihub.hub.dto.UpdateEnvironmentRequest;
import com.aihub.hub.service.EnvironmentService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/environments")
public class EnvironmentController {

    private final EnvironmentService environmentService;

    public EnvironmentController(EnvironmentService environmentService) {
        this.environmentService = environmentService;
    }

    @GetMapping
    public List<EnvironmentView> listEnvironments() {
        return environmentService.listEnvironments();
    }

    @PostMapping
    public EnvironmentView createEnvironment(@Valid @RequestBody CreateEnvironmentRequest request) {
        return environmentService.createEnvironment(request);
    }

    @PutMapping("/{environmentId}")
    public EnvironmentView updateEnvironment(
        @PathVariable Long environmentId,
        @Valid @RequestBody UpdateEnvironmentRequest request
    ) {
        return environmentService.updateEnvironment(environmentId, request);
    }
}
