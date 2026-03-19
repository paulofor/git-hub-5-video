package com.aihub.hub.web;

import com.aihub.hub.domain.Blueprint;
import com.aihub.hub.dto.BlueprintRequest;
import com.aihub.hub.repository.BlueprintRepository;
import com.aihub.hub.service.BlueprintService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/blueprints")
public class BlueprintController {

    private final BlueprintRepository repository;
    private final BlueprintService service;

    public BlueprintController(BlueprintRepository repository, BlueprintService service) {
        this.repository = repository;
        this.service = service;
    }

    @GetMapping
    public List<Blueprint> list() {
        return repository.findAll();
    }

    @PostMapping
    public ResponseEntity<Blueprint> create(@RequestHeader(value = "X-Role", defaultValue = "viewer") String role,
                                            @RequestHeader(value = "X-User", defaultValue = "unknown") String actor,
                                            @Valid @RequestBody BlueprintRequest request) {
        assertOwner(role);
        Blueprint blueprint = service.create(actor, request);
        return ResponseEntity.ok(blueprint);
    }

    private void assertOwner(String role) {
        if (!"owner".equalsIgnoreCase(role)) {
            throw new IllegalStateException("Ação requer confirmação de um owner");
        }
    }
}
