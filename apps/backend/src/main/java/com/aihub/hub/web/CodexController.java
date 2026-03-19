package com.aihub.hub.web;

import com.aihub.hub.domain.CodexInteractionRecord;
import com.aihub.hub.domain.CodexRequest;
import com.aihub.hub.domain.ResponseRecord;
import com.aihub.hub.dto.CreateCodexRequest;
import com.aihub.hub.dto.RateCodexRequest;
import com.aihub.hub.dto.SaveCodexCommentRequest;
import com.aihub.hub.service.CodexRequestService;
import com.aihub.hub.service.PullRequestService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@RestController
@RequestMapping("/api/codex/requests")
public class CodexController {

    private final CodexRequestService codexRequestService;
    private final PullRequestService pullRequestService;
    private final ObjectMapper objectMapper;

    public CodexController(CodexRequestService codexRequestService, PullRequestService pullRequestService, ObjectMapper objectMapper) {
        this.codexRequestService = codexRequestService;
        this.pullRequestService = pullRequestService;
        this.objectMapper = objectMapper;
    }

    @GetMapping
    public Object list(@RequestParam(required = false) Integer page,
                       @RequestParam(required = false) Integer size) {
        if (page == null && size == null) {
            return codexRequestService.list();
        }
        int resolvedPage = page != null ? page : 0;
        int resolvedSize = size != null ? size : 5;
        Page<CodexRequest> result = codexRequestService.listPage(resolvedPage, resolvedSize);
        return result;
    }

    @GetMapping("/{id}")
    public CodexRequest get(@PathVariable Long id) {
        return codexRequestService.find(id);
    }

    @PostMapping
    public CodexRequest create(@Valid @RequestBody CreateCodexRequest request) {
        return codexRequestService.create(request);
    }

    @GetMapping(value = "/{id}/interactions/download", produces = "application/zip")
    public ResponseEntity<byte[]> downloadInteractions(@PathVariable Long id) {
        List<CodexInteractionRecord> interactions = codexRequestService.listInteractions(id);
        CodexRequest request = codexRequestService.find(id);

        Map<String, Object> payload = new HashMap<>();
        payload.put("requestId", request.getId());
        payload.put("environment", request.getEnvironment());
        payload.put("model", request.getModel());
        payload.put("createdAt", request.getCreatedAt());
        payload.put("interactionCount", interactions.size());
        payload.put("interactions", interactions.stream().map(interaction -> {
            Map<String, Object> item = new HashMap<>();
            item.put("id", interaction.getId());
            item.put("sandboxInteractionId", interaction.getSandboxInteractionId());
            item.put("direction", interaction.getDirection());
            item.put("content", interaction.getContent());
            item.put("tokenCount", interaction.getTokenCount());
            item.put("sequence", interaction.getSequence());
            item.put("createdAt", interaction.getCreatedAt());
            return item;
        }).toList());

        byte[] jsonBytes;
        try {
            jsonBytes = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(payload);
        } catch (IOException ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Não foi possível gerar o JSON das interações", ex);
        }

        String jsonFileName = "solicitacao-" + id + "-interacoes.json";
        String zipFileName = "solicitacao-" + id + "-interacoes.zip";
        byte[] zipBytes = zipSingleEntry(jsonFileName, jsonBytes);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType("application/zip"));
        headers.setContentDisposition(ContentDisposition.attachment()
            .filename(zipFileName, StandardCharsets.UTF_8)
            .build());
        headers.setContentLength(zipBytes.length);

        return new ResponseEntity<>(zipBytes, headers, HttpStatus.OK);
    }

    @PostMapping("/{id}/comment")
    public CodexRequest comment(@PathVariable Long id, @Valid @RequestBody SaveCodexCommentRequest request) {
        return codexRequestService.saveComment(id, request);
    }

    @PostMapping("/{id}/cancel")
    public CodexRequest cancel(@PathVariable Long id) {
        return codexRequestService.cancel(id);
    }

    @PostMapping("/{id}/create-pr")
    public Map<String, Object> createPr(@PathVariable Long id,
                                        @RequestHeader(value = "X-Role", defaultValue = "viewer") String role,
                                        @RequestHeader(value = "X-User", defaultValue = "unknown") String actor) {
        assertOwner(role);
        CodexRequest request = codexRequestService.find(id);
        RepoCoordinates coordinates = RepoCoordinates.from(request.getEnvironment());
        if (coordinates == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ambiente da solicitação não está no formato owner/repo");
        }

        ResponseRecord response = codexRequestService.findLatestResponseForEnvironment(request.getEnvironment())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nenhuma resposta encontrada na tabela responses para esta solicitação"));

        String diff = Optional.ofNullable(response.getUnifiedDiff())
            .map(String::trim)
            .filter(value -> !value.isBlank())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Resposta encontrada não possui patch/unifiedDiff"));

        String title = "AI Hub: Correção da solicitação #" + request.getId();
        JsonNode pr = pullRequestService.createFixPr(
            actor,
            coordinates.owner(),
            coordinates.repo(),
            "main",
            title,
            diff,
            Optional.ofNullable(response.getFixPlan()).orElse("PR criado a partir da resposta registrada na tabela responses.")
        );

        String htmlUrl = pr != null && pr.hasNonNull("html_url") ? pr.get("html_url").asText() : null;
        Integer number = pr != null && pr.hasNonNull("number") ? pr.get("number").asInt() : null;
        Map<String, Object> payload = new HashMap<>();
        payload.put("number", number);
        payload.put("url", htmlUrl);
        payload.put("title", title);
        payload.put("createdAt", Instant.now().toString());
        return payload;
    }

    private byte[] zipSingleEntry(String entryName, byte[] data) {
        try (ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
             ZipOutputStream zipOutputStream = new ZipOutputStream(byteArrayOutputStream, StandardCharsets.UTF_8)) {
            zipOutputStream.putNextEntry(new ZipEntry(entryName));
            zipOutputStream.write(data);
            zipOutputStream.closeEntry();
            zipOutputStream.finish();
            return byteArrayOutputStream.toByteArray();
        } catch (IOException ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Não foi possível compactar as interações", ex);
        }
    }

    private void assertOwner(String role) {
        if (!"owner".equalsIgnoreCase(role)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Ação requer confirmação de um owner");
        }
    }

    private record RepoCoordinates(String owner, String repo) {
        static RepoCoordinates from(String environment) {
            if (environment == null || environment.isBlank()) {
                return null;
            }
            String[] parts = environment.trim().split("/");
            if (parts.length < 2) {
                return null;
            }
            return new RepoCoordinates(parts[0], parts[1]);
        }
    }

    @PostMapping("/{id}/rating")
    public CodexRequest rate(@PathVariable Long id, @Valid @RequestBody RateCodexRequest request) {
        return codexRequestService.rate(id, request);
    }
}
