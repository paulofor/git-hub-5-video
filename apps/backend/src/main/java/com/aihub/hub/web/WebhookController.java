package com.aihub.hub.web;

import com.aihub.hub.domain.EventEntity;
import com.aihub.hub.domain.RunRecord;
import com.aihub.hub.github.GithubAppAuth;
import com.aihub.hub.repository.EventRepository;
import com.aihub.hub.repository.RunRecordRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.Map;

@RestController
public class WebhookController {

    private final GithubAppAuth githubAppAuth;
    private final EventRepository eventRepository;
    private final RunRecordRepository runRepository;
    private final ObjectMapper objectMapper;
    private final String webhookSecret;

    public WebhookController(GithubAppAuth githubAppAuth,
                             EventRepository eventRepository,
                             RunRecordRepository runRepository,
                             ObjectMapper objectMapper,
                             @Value("${hub.github.webhook-secret:${GITHUB_WEBHOOK_SECRET:}}") String webhookSecret) {
        this.githubAppAuth = githubAppAuth;
        this.eventRepository = eventRepository;
        this.runRepository = runRepository;
        this.objectMapper = objectMapper;
        this.webhookSecret = webhookSecret;
    }

    @PostMapping("/webhooks/github")
    @Transactional
    public ResponseEntity<?> receive(@RequestBody String payload,
                                     @RequestHeader("X-GitHub-Event") String event,
                                     @RequestHeader("X-Hub-Signature-256") String signature,
                                     @RequestHeader("X-GitHub-Delivery") String deliveryId,
                                     @RequestHeader(value = "X-GitHub-Instance", required = false) String instance) {
        if (!githubAppAuth.verifySignature(payload, webhookSecret, signature)) {
            return ResponseEntity.status(401).body(Map.of("error", "assinatura inválida"));
        }
        try {
            JsonNode json = objectMapper.readTree(payload);
            String repoFullName = json.path("repository").path("full_name").asText();
            eventRepository.findByDeliveryId(deliveryId).ifPresentOrElse(existing -> {}, () -> {
                eventRepository.save(new EventEntity(repoFullName, event, deliveryId, payload));
                if ("workflow_run".equals(event)) {
                    JsonNode run = json.path("workflow_run");
                    long runId = run.path("id").asLong();
                    int attempt = run.path("run_attempt").asInt(1);
                    RunRecord record = runRepository.findByRepoAndRunIdAndAttempt(repoFullName, runId, attempt)
                        .orElseGet(() -> new RunRecord(repoFullName, runId, attempt));
                    record.setStatus(run.path("status").asText(null));
                    record.setConclusion(run.path("conclusion").asText(null));
                    record.setWorkflowName(run.path("name").asText(null));
                    record.setLogsUrl(run.path("logs_url").asText(null));
                    record.setUpdatedAt(Instant.now());
                    runRepository.save(record);
                }
            });
            return ResponseEntity.ok(Map.of("status", "evento registrado"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
