package com.aihub.hub.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Component
public class SandboxOrchestratorClient {

    private static final Logger log = LoggerFactory.getLogger(SandboxOrchestratorClient.class);

    private final RestClient restClient;
    private final String jobsPath;

    public SandboxOrchestratorClient(
        RestClient sandboxOrchestratorRestClient,
        @Value("${hub.sandbox.orchestrator.jobs-path:/jobs}") String jobsPath
    ) {
        this.restClient = sandboxOrchestratorRestClient;
        this.jobsPath = jobsPath;
    }

    public SandboxOrchestratorJobResponse createJob(SandboxJobRequest request) {
        Map<String, Object> body = new HashMap<>();
        body.put("jobId", request.jobId());
        Optional.ofNullable(request.repoSlug()).ifPresent(value -> body.put("repoSlug", value));
        Optional.ofNullable(request.repoUrl()).ifPresent(value -> body.put("repoUrl", value));
        body.put("branch", request.branch());
        body.put("taskDescription", request.taskDescription());
        Optional.ofNullable(request.commitHash()).ifPresent(value -> body.put("commit", value));
        Optional.ofNullable(request.testCommand()).ifPresent(value -> body.put("testCommand", value));
        Optional.ofNullable(request.profile()).ifPresent(value -> body.put("profile", value));
        Optional.ofNullable(request.model()).ifPresent(value -> body.put("model", value));

        Optional.ofNullable(request.database()).ifPresent(database -> {
            Map<String, Object> dbPayload = new HashMap<>();
            Optional.ofNullable(database.host()).ifPresent(value -> dbPayload.put("host", value));
            Optional.ofNullable(database.port()).ifPresent(value -> dbPayload.put("port", value));
            Optional.ofNullable(database.database()).ifPresent(value -> dbPayload.put("database", value));
            Optional.ofNullable(database.user()).ifPresent(value -> dbPayload.put("user", value));
            Optional.ofNullable(database.password()).ifPresent(value -> dbPayload.put("password", value));
            if (!dbPayload.isEmpty()) {
                body.put("database", dbPayload);
            }
        });

        Optional.ofNullable(request.callbackUrl()).ifPresent(value -> body.put("callbackUrl", value));
        Optional.ofNullable(request.callbackSecret()).ifPresent(value -> body.put("callbackSecret", value));

        log.info("Enviando job {} para sandbox-orchestrator no path {}", request.jobId(), jobsPath);
        JsonNode response = restClient.post()
            .uri(jobsPath)
            .contentType(MediaType.APPLICATION_JSON)
            .body(body)
            .retrieve()
            .body(JsonNode.class);

        return SandboxOrchestratorJobResponse.from(response);
    }

    public SandboxOrchestratorJobResponse getJob(String jobId) {
        log.info("Consultando job {} no sandbox-orchestrator", jobId);
        try {
            JsonNode response = restClient.get()
                .uri(jobsPath + "/" + jobId)
                .retrieve()
                .body(JsonNode.class);
            return SandboxOrchestratorJobResponse.from(response);
        } catch (HttpClientErrorException.NotFound ex) {
            log.warn("Job {} não encontrado no sandbox-orchestrator", jobId);
            return null;
        }
    }

    public SandboxOrchestratorJobResponse cancelJob(String jobId) {
        log.info("Solicitando cancelamento do job {} no sandbox-orchestrator", jobId);
        try {
            JsonNode response = restClient.post()
                .uri(jobsPath + "/" + jobId + "/cancel")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of())
                .retrieve()
                .body(JsonNode.class);
            return SandboxOrchestratorJobResponse.from(response);
        } catch (HttpClientErrorException.NotFound ex) {
            log.warn("Job {} não encontrado no sandbox-orchestrator ao cancelar", jobId);
            return null;
        }
    }

    public record SandboxOrchestratorJobResponse(
        String jobId,
        String status,
        String summary,
        List<String> changedFiles,
        String patch,
        String pullRequestUrl,
        String error,
        Integer promptTokens,
        Integer cachedPromptTokens,
        Integer completionTokens,
        Integer totalTokens,
        BigDecimal cost,
        String startedAt,
        String finishedAt,
        Long durationMs,
        Integer timeoutCount,
        Integer httpGetCount,
        Integer httpGetSuccessCount,
        Integer dbQueryCount,
        List<Interaction> interactions,
        List<HttpRequest> httpRequests
    ) {
        public static SandboxOrchestratorJobResponse from(JsonNode node) {
            if (node == null || node.isMissingNode()) {
                return null;
            }
            List<String> files = Optional.ofNullable(node.path("changedFiles"))
                .filter(JsonNode::isArray)
                .stream()
                .flatMap(array -> {
                    java.util.List<String> values = new java.util.ArrayList<>();
                    array.forEach(item -> {
                        String text = item.asText(null);
                        if (text != null && !text.isBlank()) {
                            values.add(text.trim());
                        }
                    });
                    return values.stream();
                })
                .toList();

            java.util.List<Interaction> interactions = null;
            JsonNode interactionsNode = node.path("interactions");
            if (interactionsNode != null && interactionsNode.isArray()) {
                java.util.List<Interaction> values = new java.util.ArrayList<>();
                interactionsNode.forEach(element -> {
                    if (element == null || element.isMissingNode() || element.isNull()) {
                        return;
                    }
                    String interactionId = readText(element, "id", "interactionId", "interaction_id");
                    if (interactionId == null || interactionId.isBlank()) {
                        return;
                    }
                    String direction = readText(element, "direction");
                    String content = readText(element, "content");
                    Integer tokenCount = readInt(element, "tokenCount", "token_count");
                    String createdAt = readText(element, "createdAt", "created_at");
                    Integer sequence = readInt(element, "sequence");
                    values.add(new Interaction(interactionId, direction, content, tokenCount, createdAt, sequence));
                });
                if (!values.isEmpty()) {
                    interactions = java.util.List.copyOf(values);
                }
            }

            java.util.List<HttpRequest> httpRequests = null;
            JsonNode httpRequestsNode = node.path("httpRequests");
            if (httpRequestsNode != null && httpRequestsNode.isArray()) {
                java.util.List<HttpRequest> values = new java.util.ArrayList<>();
                httpRequestsNode.forEach(element -> {
                    if (element == null || element.isMissingNode() || element.isNull()) {
                        return;
                    }
                    String url = readText(element, "url");
                    if (url == null || url.isBlank()) {
                        return;
                    }
                    String callId = readText(element, "callId", "call_id");
                    Integer status = readInt(element, "status", "statusCode", "status_code");
                    Boolean success = readBoolean(element, "success");
                    String toolName = readText(element, "toolName", "tool_name");
                    String requestedAt = readText(element, "requestedAt", "requested_at");
                    values.add(new HttpRequest(callId, url, status, success, toolName, requestedAt));
                });
                if (!values.isEmpty()) {
                    httpRequests = java.util.List.copyOf(values);
                }
            }

            return new SandboxOrchestratorJobResponse(
                node.path("jobId").asText(null),
                node.path("status").asText(null),
                node.path("summary").asText(null),
                files.isEmpty() ? null : files,
                node.path("patch").asText(null),
                resolvePullRequestUrl(node),
                node.path("error").asText(null),
                resolvePromptTokens(node),
                resolveCachedPromptTokens(node),
                resolveCompletionTokens(node),
                resolveTotalTokens(node),
                resolveCost(node),
                readText(node, "startedAt", "started_at"),
                readText(node, "finishedAt", "finished_at"),
                readLong(node, "durationMs", "duration_ms"),
                readInt(node, "timeoutCount", "timeout_count"),
                readInt(node, "httpGetCount", "http_get_count"),
                readInt(node, "httpGetSuccessCount", "http_get_success_count"),
                readInt(node, "dbQueryCount", "db_query_count"),
                interactions,
                httpRequests
            );
        }

        public record Interaction(
            String id,
            String direction,
            String content,
            Integer tokenCount,
            String createdAt,
            Integer sequence
        ) { }

        public record HttpRequest(
            String callId,
            String url,
            Integer status,
            Boolean success,
            String toolName,
            String requestedAt
        ) { }

        private static Integer resolvePromptTokens(JsonNode node) {
            Integer topLevel = readInt(node, "promptTokens", "prompt_tokens");
            if (topLevel != null) {
                return topLevel;
            }
            return readInt(node.path("usage"), "promptTokens", "prompt_tokens", "input_tokens");
        }


        private static Integer resolveCachedPromptTokens(JsonNode node) {
            Integer topLevel = readInt(node, "cachedPromptTokens", "cached_prompt_tokens", "cachedInputTokens", "cached_input_tokens");
            if (topLevel != null) {
                return topLevel;
            }
            return readInt(node.path("usage"), "cachedPromptTokens", "cached_prompt_tokens", "cachedInputTokens", "cached_input_tokens");
        }

        private static Integer resolveCompletionTokens(JsonNode node) {
            Integer topLevel = readInt(node, "completionTokens", "completion_tokens");
            if (topLevel != null) {
                return topLevel;
            }
            return readInt(node.path("usage"), "completionTokens", "completion_tokens", "output_tokens");
        }

        private static Integer resolveTotalTokens(JsonNode node) {
            Integer topLevel = readInt(node, "totalTokens", "total_tokens");
            if (topLevel != null) {
                return topLevel;
            }
            return readInt(node.path("usage"), "totalTokens", "total_tokens");
        }

        private static BigDecimal resolveCost(JsonNode node) {
            BigDecimal topLevel = readDecimal(node, "cost", "total_cost");
            if (topLevel != null) {
                return topLevel;
            }
            return readDecimal(node.path("usage"), "cost", "total_cost");
        }

        private static String resolvePullRequestUrl(JsonNode node) {
            return readText(node, "pullRequestUrl", "pull_request_url");
        }

        private static Integer readInt(JsonNode node, String... fields) {
            for (String field : fields) {
                JsonNode target = node.path(field);
                if (target.isNumber()) {
                    return target.intValue();
                }
                if (target.isTextual()) {
                    try {
                        return Integer.parseInt(target.asText().trim());
                    } catch (NumberFormatException ignored) {
                        // noop
                    }
                }
            }
            return null;
        }

        private static Long readLong(JsonNode node, String... fields) {
            for (String field : fields) {
                JsonNode target = node.path(field);
                if (target.isNumber()) {
                    return target.longValue();
                }
                if (target.isTextual()) {
                    try {
                        return Long.parseLong(target.asText().trim());
                    } catch (NumberFormatException ignored) {
                        // noop
                    }
                }
            }
            return null;
        }

        private static Boolean readBoolean(JsonNode node, String... fields) {
            for (String field : fields) {
                JsonNode target = node.path(field);
                if (target.isBoolean()) {
                    return target.booleanValue();
                }
                if (target.isTextual()) {
                    String text = target.asText().trim().toLowerCase();
                    if (text.equals("true") || text.equals("false")) {
                        return Boolean.parseBoolean(text);
                    }
                }
            }
            return null;
        }

        private static BigDecimal readDecimal(JsonNode node, String... fields) {
            for (String field : fields) {
                JsonNode target = node.path(field);
                if (target.isNumber()) {
                    return target.decimalValue();
                }
                if (target.isTextual()) {
                    try {
                        return new BigDecimal(target.asText().trim());
                    } catch (NumberFormatException ignored) {
                        // noop
                    }
                }
            }
            return null;
        }

        private static String readText(JsonNode node, String... fields) {
            for (String field : fields) {
                JsonNode target = node.path(field);
                if (target.isTextual()) {
                    String text = target.asText().trim();
                    if (!text.isBlank()) {
                        return text;
                    }
                }
            }
            return null;
        }
    }
}
