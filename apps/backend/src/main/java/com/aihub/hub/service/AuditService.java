package com.aihub.hub.service;

import com.aihub.hub.domain.AuditLog;
import com.aihub.hub.repository.AuditLogRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

@Service
public class AuditService {

    private final AuditLogRepository repository;
    private final ObjectMapper objectMapper;

    public AuditService(AuditLogRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    public void record(String actor, String action, String target, Object payload) {
        String jsonPayload = null;
        if (payload != null) {
            try {
                jsonPayload = objectMapper.writeValueAsString(payload);
            } catch (JsonProcessingException e) {
                jsonPayload = "{\"error\":\"serialization_failed\"}";
            }
        }
        repository.save(new AuditLog(actor, action, target, jsonPayload));
    }
}
