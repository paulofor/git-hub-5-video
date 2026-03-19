package com.aihub.hub.web;

import com.aihub.hub.service.CodexRequestService;
import com.aihub.hub.service.SandboxOrchestratorClient;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@RestController
@RequestMapping("/api/codex/requests")
public class CodexSandboxCallbackController {

    private static final Logger log = LoggerFactory.getLogger(CodexSandboxCallbackController.class);

    private final CodexRequestService codexRequestService;
    private final String expectedSecret;

    public CodexSandboxCallbackController(CodexRequestService codexRequestService,
                                          @Value("${hub.sandbox.callback.secret:}") String callbackSecret) {
        this.codexRequestService = codexRequestService;
        this.expectedSecret = StringUtils.hasText(callbackSecret) ? callbackSecret.trim() : null;
    }

    @PostMapping("/callbacks/sandbox")
    public ResponseEntity<Map<String, Object>> handleSandboxCallback(
        @RequestBody JsonNode payload,
        @RequestHeader(value = "X-Sandbox-Callback-Token", required = false) String providedSecret
    ) {
        if (StringUtils.hasText(expectedSecret)) {
            if (!StringUtils.hasText(providedSecret) || !expectedSecret.equals(providedSecret.trim())) {
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Token de callback inválido");
            }
        }

        SandboxOrchestratorClient.SandboxOrchestratorJobResponse response =
            SandboxOrchestratorClient.SandboxOrchestratorJobResponse.from(payload);

        if (response == null || !StringUtils.hasText(response.jobId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Payload do sandbox inválido");
        }

        boolean updated = codexRequestService.handleSandboxCallback(response);
        if (!updated) {
            log.info("Callback do sandbox recebido para job {} sem alterações detectadas", response.jobId());
        }

        return ResponseEntity.accepted().body(Map.of(
            "jobId", response.jobId(),
            "updated", updated
        ));
    }
}
