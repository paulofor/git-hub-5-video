package com.aihub.hub.service;

import com.aihub.hub.domain.Blueprint;
import com.aihub.hub.domain.TemplateMap;
import com.aihub.hub.dto.BlueprintRequest;
import com.aihub.hub.repository.BlueprintRepository;
import com.aihub.hub.service.AuditService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BlueprintService {

    private final BlueprintRepository repository;
    private final AuditService auditService;

    public BlueprintService(BlueprintRepository repository, AuditService auditService) {
        this.repository = repository;
        this.auditService = auditService;
    }

    @Transactional
    public Blueprint create(String actor, BlueprintRequest request) {
        TemplateMap templateMap = new TemplateMap();
        if (request.getTemplates() != null) {
            request.getTemplates().forEach(templateMap::put);
        }
        Blueprint blueprint = new Blueprint(request.getName(), request.getDescription(), templateMap);
        Blueprint saved = repository.save(blueprint);
        auditService.record(actor, "create_blueprint", saved.getName(), request.getTemplates());
        return saved;
    }
}
