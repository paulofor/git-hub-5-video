package com.aihub.hub.service;

import com.aihub.hub.domain.CodexIntegrationProfile;
import com.aihub.hub.domain.CodexInteractionDirection;
import com.aihub.hub.domain.CodexInteractionRecord;
import com.aihub.hub.domain.CodexHttpRequestLog;
import com.aihub.hub.domain.EnvironmentRecord;
import com.aihub.hub.domain.CodexRequest;
import com.aihub.hub.domain.ProblemRecord;
import com.aihub.hub.domain.CodexRequestStatus;
import com.aihub.hub.domain.PromptRecord;
import com.aihub.hub.domain.ResponseRecord;
import com.aihub.hub.dto.CreateCodexRequest;
import com.aihub.hub.dto.RateCodexRequest;
import com.aihub.hub.dto.SaveCodexCommentRequest;
import com.aihub.hub.repository.CodexHttpRequestRepository;
import com.aihub.hub.repository.EnvironmentRepository;
import com.aihub.hub.repository.CodexInteractionRepository;
import com.aihub.hub.repository.CodexRequestRepository;
import com.aihub.hub.domain.ResponseRecord;
import com.aihub.hub.repository.ProblemRepository;
import com.aihub.hub.repository.PromptRepository;
import com.aihub.hub.repository.ResponseRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class CodexRequestService {

    private static final Logger log = LoggerFactory.getLogger(CodexRequestService.class);
    private static final Duration SANDBOX_NOT_FOUND_GRACE_PERIOD = Duration.ofMinutes(15);

    private final CodexRequestRepository codexRequestRepository;
    private final PromptRepository promptRepository;
    private final ResponseRepository responseRepository;
    private final CodexInteractionRepository codexInteractionRepository;
    private final CodexHttpRequestRepository codexHttpRequestRepository;
    private final EnvironmentRepository environmentRepository;
    private final ProblemRepository problemRepository;
    private final SandboxOrchestratorClient sandboxOrchestratorClient;
    private final TokenCostCalculator tokenCostCalculator;
    private final String defaultModel;
    private final String economyModel;
    private final String defaultBranch;
    private final TransactionTemplate sandboxRefreshTemplate;
    private final String sandboxCallbackUrl;
    private final String sandboxCallbackSecret;
    private final int smartEconomyEconomyTokenCeiling;

    public CodexRequestService(CodexRequestRepository codexRequestRepository,
                               PromptRepository promptRepository,
                               ResponseRepository responseRepository,
                               CodexInteractionRepository codexInteractionRepository,
                               CodexHttpRequestRepository codexHttpRequestRepository,
                               EnvironmentRepository environmentRepository,
                               ProblemRepository problemRepository,
                               SandboxOrchestratorClient sandboxOrchestratorClient,
                               TokenCostCalculator tokenCostCalculator,
                               PlatformTransactionManager transactionManager,
                               @Value("${hub.codex.model:gpt-5-codex}") String defaultModel,
                               @Value("${hub.codex.economy-model:gpt-4.1-mini}") String economyModel,
                               @Value("${hub.codex.default-branch:main}") String defaultBranch,
                               @Value("${hub.codex.smart-economy.max-economy-tokens:1500000}") int smartEconomyEconomyTokenCeiling,
                               @Value("${hub.sandbox.callback.url:}") String sandboxCallbackUrl,
                               @Value("${hub.sandbox.callback.secret:}") String sandboxCallbackSecret) {
        this.codexRequestRepository = codexRequestRepository;
        this.promptRepository = promptRepository;
        this.responseRepository = responseRepository;
        this.codexInteractionRepository = codexInteractionRepository;
        this.codexHttpRequestRepository = codexHttpRequestRepository;
        this.environmentRepository = environmentRepository;
        this.problemRepository = problemRepository;
        this.sandboxOrchestratorClient = sandboxOrchestratorClient;
        this.tokenCostCalculator = tokenCostCalculator;
        this.defaultModel = defaultModel;
        this.economyModel = economyModel;
        this.defaultBranch = defaultBranch;
        this.sandboxCallbackUrl = StringUtils.hasText(sandboxCallbackUrl) ? sandboxCallbackUrl.trim() : null;
        this.sandboxCallbackSecret = StringUtils.hasText(sandboxCallbackSecret) ? sandboxCallbackSecret.trim() : null;
        this.smartEconomyEconomyTokenCeiling = smartEconomyEconomyTokenCeiling > 0 ? smartEconomyEconomyTokenCeiling : 1_500_000;
        Objects.requireNonNull(transactionManager, "transactionManager is required");
        this.sandboxRefreshTemplate = new TransactionTemplate(transactionManager);
        this.sandboxRefreshTemplate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    @Transactional
    public CodexRequest create(CreateCodexRequest request) {
        CodexIntegrationProfile profile = resolveProfile(request.getProfile());
        String model = resolveModel(profile, request.getModel(), request);
        String normalizedEnvironment = request.getEnvironment().trim();
        log.info("Criando CodexRequest para ambiente {} com modelo {} (perfil {})", request.getEnvironment(), model, profile);
        CodexRequest codexRequest = new CodexRequest(
            normalizedEnvironment,
            model,
            profile,
            request.getPrompt().trim()
        );

        codexRequest.setProfile(profile);
        codexRequest.setStatus(CodexRequestStatus.PENDING);
        codexRequest.setPromptTokens(request.getPromptTokens());
        codexRequest.setCachedPromptTokens(request.getCachedPromptTokens());
        codexRequest.setCompletionTokens(request.getCompletionTokens());
        codexRequest.setTotalTokens(request.getTotalTokens());
        codexRequest.setPromptCost(request.getPromptCost());
        codexRequest.setCachedPromptCost(request.getCachedPromptCost());
        codexRequest.setCompletionCost(request.getCompletionCost());
        codexRequest.setCost(request.getCost());
        ProblemRecord problem = resolveProblemAssociation(request.getProblemId(), normalizedEnvironment);
        if (problem != null) {
            codexRequest.setProblem(problem);
        }
        codexRequest.setTimeoutCount(0);
        codexRequest.setHttpGetCount(0);
        codexRequest.setDbQueryCount(0);

        PromptMetadata metadata = extractMetadata(request.getEnvironment());
        PromptRecord promptRecord = new PromptRecord(
            metadata.repo(),
            metadata.branch(),
            metadata.runId(),
            metadata.prNumber(),
            model,
            request.getPrompt().trim()
        );
        promptRepository.save(promptRecord);

        CodexRequest saved = saveRequest(codexRequest);
        log.info("CodexRequest {} salvo, enviando para sandbox se aplicável", saved.getId());
        saved.setInteractionCount(0);
        dispatchToSandbox(saved);
        return saved;
    }

    public Optional<ResponseRecord> findLatestResponseForEnvironment(String environment) {
        PromptMetadata metadata = extractMetadata(environment);
        if (metadata == null || metadata.repo() == null) {
            return Optional.empty();
        }

        if (metadata.runId() != null && metadata.prNumber() != null) {
            Optional<ResponseRecord> record = responseRepository.findTopByRepoAndRunIdAndPrNumberOrderByCreatedAtDesc(
                metadata.repo(), metadata.runId(), metadata.prNumber()
            );
            if (record.isPresent()) {
                return record;
            }
        }

        if (metadata.runId() != null) {
            Optional<ResponseRecord> record = responseRepository.findTopByRepoAndRunIdOrderByCreatedAtDesc(
                metadata.repo(), metadata.runId()
            );
            if (record.isPresent()) {
                return record;
            }
        }

        if (metadata.prNumber() != null) {
            Optional<ResponseRecord> record = responseRepository.findTopByRepoAndPrNumberOrderByCreatedAtDesc(
                metadata.repo(), metadata.prNumber()
            );
            if (record.isPresent()) {
                return record;
            }
        }

        return responseRepository.findTopByRepoOrderByCreatedAtDesc(metadata.repo());
    }

    public List<CodexRequest> list() {
        Instant refreshCutoff = Instant.now().minus(Duration.ofHours(1));
        List<CodexRequest> requests = codexRequestRepository.findAllByOrderByCreatedAtDesc();
        boolean refreshedAny = false;

        for (CodexRequest request : requests) {
            if (request.getExternalId() == null) {
                continue;
            }

            RefreshDecision decision = evaluateRefresh(request, refreshCutoff);
            if (!decision.shouldRefresh()) {
                continue;
            }

            log.info(
                "Atualizando CodexRequest {} a partir do sandbox ({})",
                request.getId(),
                decision.reason()
            );
            boolean updated = refreshFromSandbox(request);
            refreshedAny = refreshedAny || updated;
        }

        if (refreshedAny) {
            requests = codexRequestRepository.findAllByOrderByCreatedAtDesc();
        }

        applyInteractionCounts(requests);
        return requests;
    }

    public Page<CodexRequest> listPage(int page, int size) {
        Instant refreshCutoff = Instant.now().minus(Duration.ofHours(1));
        PageRequest pageRequest = PageRequest.of(page, size);
        Page<CodexRequest> requestPage = codexRequestRepository.findAllByOrderByCreatedAtDesc(pageRequest);
        boolean refreshedAny = false;

        for (CodexRequest request : requestPage.getContent()) {
            if (request.getExternalId() == null) {
                continue;
            }

            RefreshDecision decision = evaluateRefresh(request, refreshCutoff);
            if (!decision.shouldRefresh()) {
                continue;
            }

            log.info(
                "Atualizando CodexRequest {} a partir do sandbox ({})",
                request.getId(),
                decision.reason()
            );
            boolean updated = refreshFromSandbox(request);
            refreshedAny = refreshedAny || updated;
        }

        if (refreshedAny) {
            requestPage = codexRequestRepository.findAllByOrderByCreatedAtDesc(pageRequest);
        }

        applyInteractionCounts(requestPage.getContent());
        return requestPage;
    }

    @Transactional(readOnly = true)
    public List<CodexInteractionRecord> listInteractions(Long requestId) {
        find(requestId);
        return codexInteractionRepository.findAllByCodexRequestIdOrderBySequenceAscIdAsc(requestId);
    }

    @Transactional(readOnly = true)
    public CodexRequest find(Long id) {
        CodexRequest request = codexRequestRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Solicitação Codex não encontrada"));
        request.setInteractionCount(codexInteractionRepository.countByCodexRequestId(id));
        return request;
    }

    @Transactional
    public CodexRequest saveComment(Long id, SaveCodexCommentRequest payload) {
        CodexRequest request = find(id);
        String comment = Optional.ofNullable(payload.getComment())
            .map(String::trim)
            .filter(value -> !value.isBlank())
            .orElse(null);
        String problemDescription = Optional.ofNullable(payload.getProblemDescription())
            .map(String::trim)
            .filter(value -> !value.isBlank())
            .orElse(null);
        String resolutionDifficulty = Optional.ofNullable(payload.getResolutionDifficulty())
            .map(String::trim)
            .filter(value -> !value.isBlank())
            .orElse(null);
        String executionLog = Optional.ofNullable(payload.getExecutionLog())
            .map(String::trim)
            .filter(value -> !value.isBlank())
            .orElse(null);
        request.setUserComment(comment);
        request.setProblemDescription(problemDescription);
        request.setResolutionDifficulty(resolutionDifficulty);
        request.setExecutionLog(executionLog);
        updateInteractionCount(request);
        return saveRequest(request);
    }

    private SandboxJobRequest.DatabaseConnection resolveDatabase(String environmentName) {
        if (!StringUtils.hasText(environmentName)) {
            return null;
        }

        Optional<EnvironmentRecord> record = environmentRepository.findByNameIgnoreCase(environmentName.trim());
        if (record.isEmpty()) {
            return null;
        }

        EnvironmentRecord environment = record.get();
        if (!StringUtils.hasText(environment.getDbHost())
            || !StringUtils.hasText(environment.getDbName())
            || !StringUtils.hasText(environment.getDbUser())) {
            return null;
        }

        return new SandboxJobRequest.DatabaseConnection(
            environment.getDbHost().trim(),
            environment.getDbPort(),
            environment.getDbName().trim(),
            environment.getDbUser().trim(),
            environment.getDbPassword()
        );
    }


    private RefreshDecision evaluateRefresh(CodexRequest request, Instant refreshCutoff) {
        CodexRequestStatus status = Optional.ofNullable(request.getStatus()).orElse(CodexRequestStatus.PENDING);
        boolean hasResponse = StringUtils.hasText(request.getResponseText());
        boolean hasUsageMetadata = hasUsageMetadata(request);

        if (status.isTerminal() && hasResponse && hasUsageMetadata) {
            if (hasSandboxNotFoundFallback(request)) {
                return RefreshDecision.skip("sandbox já informou ausência do job");
            }
            return RefreshDecision.skip();
        }

        if (request.getCreatedAt() == null) {
            return new RefreshDecision(true, "sem data de criação, dados incompletos");
        }

        if (request.getCreatedAt().isAfter(refreshCutoff)) {
            return new RefreshDecision(true, "dentro da janela de atualização automática");
        }

        if (!hasResponse && !hasUsageMetadata) {
            return new RefreshDecision(true, "dados ausentes após janela de atualização");
        }

        if (!hasResponse) {
            return new RefreshDecision(true, "resposta ausente após janela de atualização");
        }

        return new RefreshDecision(true, "metadados de uso ausentes após janela de atualização");
    }

    private boolean hasSandboxNotFoundFallback(CodexRequest request) {
        if (request == null) {
            return false;
        }
        String responseText = request.getResponseText();
        return StringUtils.hasText(responseText)
            && responseText.trim().startsWith("Sandbox não encontrou o job");
    }

    private boolean hasUsageMetadata(CodexRequest request) {
        if (request == null) {
            return false;
        }
        return request.getPromptTokens() != null
            && request.getCachedPromptTokens() != null
            && request.getCompletionTokens() != null
            && request.getTotalTokens() != null
            && request.getPromptCost() != null
            && request.getCachedPromptCost() != null
            && request.getCompletionCost() != null
            && request.getCost() != null;
    }

    private boolean applySandboxNotFoundFallback(CodexRequest request, boolean allowStatusOverride) {
        boolean updated = false;

        if (!StringUtils.hasText(request.getResponseText())) {
            request.setResponseText(String.format(
                "Sandbox não encontrou o job %s; os dados podem ter expirado.",
                request.getExternalId()
            ));
            updated = true;
        }
        if (request.getPromptTokens() == null) {
            request.setPromptTokens(0);
            updated = true;
        }
        if (request.getCachedPromptTokens() == null) {
            request.setCachedPromptTokens(0);
            updated = true;
        }
        if (request.getCompletionTokens() == null) {
            request.setCompletionTokens(0);
            updated = true;
        }
        if (request.getTotalTokens() == null) {
            request.setTotalTokens(0);
            updated = true;
        }
        if (request.getPromptCost() == null) {
            request.setPromptCost(BigDecimal.ZERO);
            updated = true;
        }
        if (request.getCachedPromptCost() == null) {
            request.setCachedPromptCost(BigDecimal.ZERO);
            updated = true;
        }
        if (request.getCompletionCost() == null) {
            request.setCompletionCost(BigDecimal.ZERO);
            updated = true;
        }
        if (request.getCost() == null) {
            request.setCost(BigDecimal.ZERO);
            updated = true;
        }
        if (allowStatusOverride && request.getStatus() != CodexRequestStatus.CANCELLED) {
            request.setStatus(CodexRequestStatus.FAILED);
            updated = true;
        }
        if (request.getFinishedAt() == null) {
            Instant finishedAt = Instant.now();
            request.setFinishedAt(finishedAt);
            if (request.getStartedAt() == null) {
                request.setStartedAt(Optional.ofNullable(request.getCreatedAt()).orElse(finishedAt));
            }
            request.setDurationMs(Duration.between(request.getStartedAt(), finishedAt).toMillis());
            updated = true;
        } else if (request.getDurationMs() == null && request.getStartedAt() != null) {
            request.setDurationMs(Duration.between(request.getStartedAt(), request.getFinishedAt()).toMillis());
            updated = true;
        }

        return updated;
    }

    private CodexIntegrationProfile resolveProfile(CodexIntegrationProfile candidate) {
        return candidate != null ? candidate : CodexIntegrationProfile.STANDARD;
    }

    private String resolveModel(CodexIntegrationProfile profile, String candidate, CreateCodexRequest request) {
        if (StringUtils.hasText(candidate)) {
            return candidate.trim();
        }
        if (profile == CodexIntegrationProfile.SMART_ECONOMY) {
            boolean preferEconomy = shouldRunSmartEconomyAsEconomy(request);
            if (preferEconomy && StringUtils.hasText(economyModel)) {
                return economyModel.trim();
            }
            return defaultModel;
        }
        if ((profile == CodexIntegrationProfile.ECONOMY
            || profile == CodexIntegrationProfile.ECO_1
            || profile == CodexIntegrationProfile.ECO_2
            || profile == CodexIntegrationProfile.ECO_3
            || profile == CodexIntegrationProfile.CHATGPT_CODEX)
            && StringUtils.hasText(economyModel)) {
            return economyModel.trim();
        }
        return defaultModel;
    }

    private boolean shouldRunSmartEconomyAsEconomy(CreateCodexRequest request) {
        if (request == null) {
            return false;
        }
        if (!StringUtils.hasText(economyModel)) {
            return false;
        }
        int footprint = estimateTokenFootprint(request);
        return footprint > 0 && footprint <= smartEconomyEconomyTokenCeiling;
    }

    private int estimateTokenFootprint(CreateCodexRequest request) {
        if (request == null) {
            return 0;
        }
        if (request.getTotalTokens() != null && request.getTotalTokens() > 0) {
            return request.getTotalTokens();
        }
        int aggregate = 0;
        if (request.getPromptTokens() != null && request.getPromptTokens() > 0) {
            aggregate += request.getPromptTokens();
        }
        if (request.getCachedPromptTokens() != null && request.getCachedPromptTokens() > 0) {
            aggregate += request.getCachedPromptTokens();
        }
        if (request.getCompletionTokens() != null && request.getCompletionTokens() > 0) {
            aggregate += request.getCompletionTokens();
        }
        if (aggregate > 0) {
            return aggregate;
        }
        String prompt = request.getPrompt();
        if (StringUtils.hasText(prompt)) {
            return Math.max(1, prompt.trim().length() / 4);
        }
        return 0;
    }

    private PromptMetadata extractMetadata(String environment) {
        RepoCoordinates coordinates = RepoCoordinates.from(environment);
        String repo = coordinates != null
            ? coordinates.owner() + "/" + coordinates.repo()
            : Optional.ofNullable(environment).map(String::trim).filter(value -> !value.isBlank()).orElse("unknown");

        String branch = extractBranch(environment);
        Long runId = extractNumber(environment, "(?i)run[:/#]\\s*(\\d+)");
        Integer prNumber = Optional.ofNullable(extractNumber(environment, "(?i)pr[:/#]\\s*(\\d+)")).map(Long::intValue).orElse(null);

        return new PromptMetadata(repo, branch, runId, prNumber);
    }

    private String extractBranch(String environment) {
        if (!StringUtils.hasText(environment)) {
            return defaultBranch;
        }
        Matcher matcher = Pattern.compile("@([\\w./-]+)").matcher(environment);
        if (matcher.find()) {
            return matcher.group(1).trim();
        }

        String[] parts = environment.trim().split("/");
        if (parts.length >= 3 && StringUtils.hasText(parts[2])) {
            return parts[2].trim();
        }

        return defaultBranch;
    }

    private Long extractNumber(String environment, String pattern) {
        if (!StringUtils.hasText(environment)) {
            return null;
        }
        Matcher matcher = Pattern.compile(pattern).matcher(environment);
        if (matcher.find()) {
            try {
                return Long.parseLong(matcher.group(1));
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    private void dispatchToSandbox(CodexRequest request) {
        RepoCoordinates coordinates = RepoCoordinates.from(request.getEnvironment());
        if (coordinates == null) {
            log.info("Ambiente {} não corresponde a um repositório; ignorando envio para o sandbox", request.getEnvironment());
            request.setStatus(CodexRequestStatus.FAILED);
            if (!StringUtils.hasText(request.getResponseText())) {
                request.setResponseText("Ambiente informado não corresponde a um repositório Git válido para o sandbox.");
            }
            Instant finishedAt = Instant.now();
            request.setFinishedAt(finishedAt);
            if (request.getStartedAt() == null) {
                request.setStartedAt(Optional.ofNullable(request.getCreatedAt()).orElse(finishedAt));
            }
            request.setDurationMs(Duration.between(request.getStartedAt(), finishedAt).toMillis());
            saveRequest(request);
            return;
        }

        String jobId = UUID.randomUUID().toString();
        log.info("Enviando CodexRequest {} para sandbox com jobId {} e branch padrão {}", request.getId(), jobId, defaultBranch);
        PromptMetadata metadata = extractMetadata(request.getEnvironment());

        String callbackUrl = this.sandboxCallbackUrl;
        String callbackSecret = callbackUrl != null ? this.sandboxCallbackSecret : null;

        SandboxJobRequest jobRequest = new SandboxJobRequest(
            jobId,
            coordinates.owner() + "/" + coordinates.repo(),
            null,
            defaultBranch,
            request.getPrompt(),
            null,
            null,
            Optional.ofNullable(request.getProfile()).map(Enum::name).orElse(null),
            request.getModel(),
            resolveDatabase(request.getEnvironment()),
            callbackUrl,
            callbackSecret
        );

        SandboxOrchestratorClient.SandboxOrchestratorJobResponse response = sandboxOrchestratorClient.createJob(jobRequest);
        log.info("Sandbox retornou resposta para CodexRequest {} com jobId {}", request.getId(), response != null ? response.jobId() : jobId);
        String resolvedExternalId = Optional.ofNullable(response)
            .map(SandboxOrchestratorClient.SandboxOrchestratorJobResponse::jobId)
            .orElse(jobId);
        request.setExternalId(resolvedExternalId);
        applySandboxMetadata(request, response);
        Optional.ofNullable(response)
            .map(SandboxOrchestratorClient.SandboxOrchestratorJobResponse::summary)
            .filter(StringUtils::hasText)
            .ifPresent(summary -> request.setResponseText(summary.trim()));
        Optional.ofNullable(response)
            .map(SandboxOrchestratorClient.SandboxOrchestratorJobResponse::error)
            .filter(StringUtils::hasText)
            .ifPresent(error -> request.setResponseText(error.trim()));
        applyUsageMetadata(request, response);

        saveRequest(request);
        log.info("CodexRequest {} atualizado com externalId {}", request.getId(), resolvedExternalId);

        recordResponse(metadata, response);
        recordInteractions(request, response);
        recordHttpRequests(request, response);
    }

    @Transactional
    public boolean handleSandboxCallback(SandboxOrchestratorClient.SandboxOrchestratorJobResponse response) {
        if (response == null || !StringUtils.hasText(response.jobId())) {
            log.warn("Callback do sandbox ignorado: payload sem jobId");
            return false;
        }

        String jobId = response.jobId().trim();
        Optional<CodexRequest> optional = codexRequestRepository.findByExternalId(jobId);
        if (optional.isEmpty()) {
            log.warn("Callback do sandbox ignorado: nenhum CodexRequest com externalId {}", jobId);
            return false;
        }

        CodexRequest managed = optional.get();
        boolean updated = synchronizeRequestWithSandbox(managed, response);
        if (updated) {
            log.info("CodexRequest {} atualizado via callback do sandbox", managed.getId());
        } else {
            log.info("Callback do sandbox recebido para CodexRequest {} sem alterações", managed.getId());
        }
        return updated;
    }

    private boolean refreshFromSandbox(CodexRequest request) {
        SandboxOrchestratorClient.SandboxOrchestratorJobResponse response =
            sandboxOrchestratorClient.getJob(request.getExternalId());

        if (request.getId() == null) {
            return synchronizeRequestWithSandbox(request, response);
        }

        AtomicBoolean updated = new AtomicBoolean(false);
        try {
            sandboxRefreshTemplate.executeWithoutResult(status ->
                codexRequestRepository.findById(request.getId()).ifPresent(managed -> {
                    boolean changed = synchronizeRequestWithSandbox(managed, response);
                    if (changed) {
                        updated.set(true);
                    }
                })
            );
        } catch (Exception ex) {
            log.error("Falha ao atualizar CodexRequest {} a partir do sandbox", request.getId(), ex);
        }
        return updated.get();
    }

    private boolean synchronizeRequestWithSandbox(CodexRequest request, SandboxOrchestratorClient.SandboxOrchestratorJobResponse response) {
        if (request == null || !StringUtils.hasText(request.getExternalId())) {
            return false;
        }

        if (response == null) {
            return handleMissingSandboxResponse(request);
        }

        boolean updated = applySandboxMetadata(request, response);
        if (response.summary() != null && !response.summary().isBlank()) {
            log.info("Sandbox retornou resumo para CodexRequest {}", request.getId());
            request.setResponseText(response.summary().trim());
            updated = true;
        }
        if (response.error() != null && !response.error().isBlank()) {
            log.info("Sandbox retornou erro para CodexRequest {}", request.getId());
            request.setResponseText(response.error().trim());
            updated = true;
        }

        boolean usageUpdated = applyUsageMetadata(request, response);

        if (updated || usageUpdated) {
            saveRequest(request);
            log.info("CodexRequest {} atualizado a partir do sandbox", request.getId());
        }

        recordResponse(extractMetadata(request.getEnvironment()), response);
        recordInteractions(request, response);
        recordHttpRequests(request, response);

        return updated || usageUpdated;
    }

    private boolean handleMissingSandboxResponse(CodexRequest request) {
        CodexRequestStatus currentStatus = Optional.ofNullable(request.getStatus()).orElse(CodexRequestStatus.PENDING);
        Instant referenceInstant = Optional.ofNullable(request.getStartedAt())
            .orElseGet(() -> Optional.ofNullable(request.getCreatedAt()).orElse(null));
        boolean withinGracePeriod = referenceInstant == null
            || referenceInstant.isAfter(Instant.now().minus(SANDBOX_NOT_FOUND_GRACE_PERIOD));

        if (withinGracePeriod) {
            log.warn(
                "Sandbox ainda não encontrou o job {} (status atual: {}); mantendo estado e tentando novamente dentro do período de tolerância",
                request.getExternalId(),
                currentStatus
            );
            return false;
        }

        boolean hasResponseText = StringUtils.hasText(request.getResponseText());
        boolean missingCriticalData = !hasResponseText
            || !hasUsageMetadata(request)
            || request.getFinishedAt() == null
            || (request.getDurationMs() == null && request.getStartedAt() != null);

        if (!missingCriticalData) {
            log.warn(
                "Sandbox não encontrou o job {}, mas a solicitação já está finalizada com status {}. Mantendo dados atuais.",
                request.getExternalId(),
                currentStatus
            );
            return false;
        }

        log.info(
            "Nenhuma resposta encontrada no sandbox para CodexRequest {} com externalId {}",
            request.getId(),
            request.getExternalId()
        );

        boolean updated = applySandboxNotFoundFallback(request, !currentStatus.isTerminal());
        if (updated) {
            saveRequest(request);
        }

        return updated;
    }

    @Transactional
    public CodexRequest cancel(Long id) {
        CodexRequest request = codexRequestRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Solicitação Codex não encontrada"));
        CodexRequestStatus status = Optional.ofNullable(request.getStatus()).orElse(CodexRequestStatus.PENDING);
        if (status.isTerminal()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Solicitação já foi finalizada");
        }

        if (!StringUtils.hasText(request.getExternalId())) {
            Instant finishedAt = Instant.now();
            request.setStatus(CodexRequestStatus.CANCELLED);
            request.setFinishedAt(finishedAt);
            if (request.getStartedAt() == null) {
                request.setStartedAt(Optional.ofNullable(request.getCreatedAt()).orElse(finishedAt));
            }
            request.setDurationMs(Duration.between(request.getStartedAt(), finishedAt).toMillis());
            CodexRequest saved = saveRequest(request);
            saved.setInteractionCount(codexInteractionRepository.countByCodexRequestId(saved.getId()));
            return saved;
        }

        SandboxOrchestratorClient.SandboxOrchestratorJobResponse response = sandboxOrchestratorClient.cancelJob(request.getExternalId());
        if (response != null) {
            applySandboxMetadata(request, response);
            if (StringUtils.hasText(response.error())) {
                request.setResponseText(response.error().trim());
            } else if (StringUtils.hasText(response.summary())) {
                request.setResponseText(response.summary().trim());
            }
            applyUsageMetadata(request, response);
            recordInteractions(request, response);
        recordHttpRequests(request, response);
        } else {
            Instant finishedAt = Instant.now();
            request.setStatus(CodexRequestStatus.CANCELLED);
            request.setFinishedAt(finishedAt);
            if (request.getStartedAt() == null) {
                request.setStartedAt(Optional.ofNullable(request.getCreatedAt()).orElse(finishedAt));
            }
            request.setDurationMs(Duration.between(request.getStartedAt(), finishedAt).toMillis());
        }

        if (request.getStatus() != null && request.getStatus().isTerminal() && request.getFinishedAt() == null) {
            Instant finishedAt = Instant.now();
            request.setFinishedAt(finishedAt);
            if (request.getStartedAt() == null) {
                request.setStartedAt(Optional.ofNullable(request.getCreatedAt()).orElse(finishedAt));
            }
            request.setDurationMs(Duration.between(request.getStartedAt(), finishedAt).toMillis());
        }

        CodexRequest saved = saveRequest(request);
        saved.setInteractionCount(codexInteractionRepository.countByCodexRequestId(saved.getId()));
        return saved;
    }

    @Transactional
    public CodexRequest rate(Long id, RateCodexRequest payload) {
        CodexRequest request = codexRequestRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Solicitação Codex não encontrada"));
        CodexRequestStatus status = Optional.ofNullable(request.getStatus()).orElse(CodexRequestStatus.PENDING);
        if (status != CodexRequestStatus.COMPLETED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Avaliações só são permitidas para solicitações concluídas");
        }
        if (payload.getRating() == null || payload.getRating() < 1 || payload.getRating() > 5) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Rating deve estar entre 1 e 5");
        }
        request.setRating(payload.getRating());
        updateInteractionCount(request);
        return saveRequest(request);
    }

    private boolean applySandboxMetadata(CodexRequest request, SandboxOrchestratorClient.SandboxOrchestratorJobResponse response) {
        if (response == null) {
            return false;
        }

        boolean updated = false;
        CodexRequestStatus sandboxStatus = CodexRequestStatus.fromSandboxStatus(response.status());
        if (sandboxStatus != null && sandboxStatus != request.getStatus()) {
            request.setStatus(sandboxStatus);
            updated = true;
        }

        Instant startedAt = parseInstant(response.startedAt());
        if (!Objects.equals(request.getStartedAt(), startedAt)) {
            request.setStartedAt(startedAt);
            updated = true;
        }

        Instant finishedAt = parseInstant(response.finishedAt());
        if (!Objects.equals(request.getFinishedAt(), finishedAt)) {
            request.setFinishedAt(finishedAt);
            updated = true;
        }

        Long durationMs = response.durationMs();
        if (durationMs == null && startedAt != null && finishedAt != null) {
            durationMs = Duration.between(startedAt, finishedAt).toMillis();
        }
        if (!Objects.equals(request.getDurationMs(), durationMs)) {
            request.setDurationMs(durationMs);
            updated = true;
        }

        Integer timeoutCount = response.timeoutCount();
        if (timeoutCount != null && !Objects.equals(request.getTimeoutCount(), timeoutCount)) {
            request.setTimeoutCount(timeoutCount);
            updated = true;
        }
        Integer httpGetCount = response.httpGetCount();
        if (httpGetCount != null && !Objects.equals(request.getHttpGetCount(), httpGetCount)) {
            request.setHttpGetCount(httpGetCount);
            updated = true;
        }
        Integer httpGetSuccessCount = response.httpGetSuccessCount();
        if (httpGetSuccessCount != null && !Objects.equals(request.getHttpGetSuccessCount(), httpGetSuccessCount)) {
            request.setHttpGetSuccessCount(httpGetSuccessCount);
            updated = true;
        }

        Integer dbQueryCount = response.dbQueryCount();
        if (dbQueryCount != null && !Objects.equals(request.getDbQueryCount(), dbQueryCount)) {
            request.setDbQueryCount(dbQueryCount);
            updated = true;
        }

        String pullRequestUrl = response.pullRequestUrl();
        if (StringUtils.hasText(pullRequestUrl) && !Objects.equals(request.getPullRequestUrl(), pullRequestUrl.trim())) {
            request.setPullRequestUrl(pullRequestUrl.trim());
            updated = true;
        }

        return updated;
    }

    private Instant parseInstant(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        try {
            return Instant.parse(value);
        } catch (DateTimeParseException ex) {
            log.warn("Não foi possível converter timestamp do sandbox: {}", value, ex);
            return null;
        }
    }

    private void recordResponse(PromptMetadata metadata, SandboxOrchestratorClient.SandboxOrchestratorJobResponse response) {
        if (response == null) {
            return;
        }

        boolean hasContent = (response.summary() != null && !response.summary().isBlank())
            || (response.patch() != null && !response.patch().isBlank())
            || (response.error() != null && !response.error().isBlank());
        if (!hasContent) {
            return;
        }

        PromptRecord prompt = findPromptRecord(metadata).orElse(null);
        ResponseRecord record = new ResponseRecord(prompt, metadata.repo(), metadata.runId(), metadata.prNumber());
        Optional.ofNullable(response.summary()).filter(value -> !value.isBlank()).ifPresent(record::setFixPlan);
        Optional.ofNullable(response.patch()).filter(value -> !value.isBlank()).ifPresent(record::setUnifiedDiff);
        Optional.ofNullable(response.error()).filter(value -> !value.isBlank()).ifPresent(record::setRootCause);
        responseRepository.save(record);
    }

    private Optional<PromptRecord> findPromptRecord(PromptMetadata metadata) {
        if (metadata == null || metadata.repo() == null) {
            return Optional.empty();
        }

        if (metadata.runId() != null && metadata.prNumber() != null) {
            Optional<PromptRecord> record = promptRepository.findTopByRepoAndRunIdAndPrNumberOrderByCreatedAtDesc(
                metadata.repo(), metadata.runId(), metadata.prNumber()
            );
            if (record.isPresent()) {
                return record;
            }
        }

        if (metadata.runId() != null) {
            Optional<PromptRecord> record = promptRepository.findTopByRepoAndRunIdOrderByCreatedAtDesc(
                metadata.repo(), metadata.runId()
            );
            if (record.isPresent()) {
                return record;
            }
        }

        if (metadata.prNumber() != null) {
            Optional<PromptRecord> record = promptRepository.findTopByRepoAndPrNumberOrderByCreatedAtDesc(
                metadata.repo(), metadata.prNumber()
            );
            if (record.isPresent()) {
                return record;
            }
        }

        return promptRepository.findTopByRepoOrderByCreatedAtDesc(metadata.repo());
    }

    private boolean applyUsageMetadata(
        CodexRequest request,
        SandboxOrchestratorClient.SandboxOrchestratorJobResponse response
    ) {
        if (response == null) {
            return false;
        }

        boolean updated = false;
        Integer promptTokens = response.promptTokens();
        Integer cachedPromptTokens = response.cachedPromptTokens();
        Integer completionTokens = response.completionTokens();
        Integer totalTokens = response.totalTokens();

        if (totalTokens == null) {
            int sum = 0;
            boolean hasAny = false;
            if (promptTokens != null) {
                sum += promptTokens;
                hasAny = true;
            }
            if (cachedPromptTokens != null) {
                sum += cachedPromptTokens;
                hasAny = true;
            }
            if (completionTokens != null) {
                sum += completionTokens;
                hasAny = true;
            }
            if (hasAny) {
                totalTokens = sum;
            }
        }

        TokenCostBreakdown breakdown = tokenCostCalculator.calculate(
            request.getModel(),
            promptTokens,
            cachedPromptTokens,
            completionTokens,
            totalTokens
        );

        if (breakdown != null) {
            if (promptTokens == null) {
                promptTokens = breakdown.inputTokens();
            }
            if (cachedPromptTokens == null) {
                cachedPromptTokens = breakdown.cachedInputTokens();
            }
            if (completionTokens == null) {
                completionTokens = breakdown.outputTokens();
            }
            if (totalTokens == null) {
                totalTokens = breakdown.totalTokens();
            }
        }

        if (!Objects.equals(request.getPromptTokens(), promptTokens)) {
            request.setPromptTokens(promptTokens);
            updated = true;
        }
        if (!Objects.equals(request.getCachedPromptTokens(), cachedPromptTokens)) {
            request.setCachedPromptTokens(cachedPromptTokens);
            updated = true;
        }
        if (!Objects.equals(request.getCompletionTokens(), completionTokens)) {
            request.setCompletionTokens(completionTokens);
            updated = true;
        }
        if (!Objects.equals(request.getTotalTokens(), totalTokens)) {
            request.setTotalTokens(totalTokens);
            updated = true;
        }

        if (breakdown != null) {
            BigDecimal promptCost = breakdown.inputCost();
            BigDecimal cachedPromptCost = breakdown.cachedInputCost();
            BigDecimal completionCost = breakdown.outputCost();
            Integer breakdownTotalTokens = breakdown.totalTokens();

            if (promptCost != null && (request.getPromptCost() == null || promptCost.compareTo(request.getPromptCost()) != 0)) {
                request.setPromptCost(promptCost);
                updated = true;
            }
            if (cachedPromptCost != null && (request.getCachedPromptCost() == null || cachedPromptCost.compareTo(request.getCachedPromptCost()) != 0)) {
                request.setCachedPromptCost(cachedPromptCost);
                updated = true;
            }
            if (completionCost != null && (request.getCompletionCost() == null || completionCost.compareTo(request.getCompletionCost()) != 0)) {
                request.setCompletionCost(completionCost);
                updated = true;
            }
            if (breakdownTotalTokens != null && !Objects.equals(request.getTotalTokens(), breakdownTotalTokens)) {
                request.setTotalTokens(breakdownTotalTokens);
                totalTokens = breakdownTotalTokens;
                updated = true;
            }
        }

        BigDecimal resolvedCost = response.cost();
        if (resolvedCost == null && breakdown != null) {
            resolvedCost = breakdown.totalCost();
        }
        if (resolvedCost != null && (request.getCost() == null || resolvedCost.compareTo(request.getCost()) != 0)) {
            request.setCost(resolvedCost);
            updated = true;
        }

        return updated;
    }

    private CodexRequest saveRequest(CodexRequest request) {
        updateProblemCostAggregation(request);
        return codexRequestRepository.save(request);
    }

    private void updateProblemCostAggregation(CodexRequest request) {
        if (request == null) {
            return;
        }
        ProblemRecord problem = request.getProblem();
        if (problem == null || problem.getId() == null) {
            return;
        }
        CodexRequestStatus status = Optional.ofNullable(request.getStatus()).orElse(CodexRequestStatus.PENDING);
        if (!status.isTerminal()) {
            return;
        }
        BigDecimal resolvedCost = Optional.ofNullable(request.getCost()).orElse(BigDecimal.ZERO);
        if (resolvedCost.compareTo(BigDecimal.ZERO) < 0) {
            resolvedCost = BigDecimal.ZERO;
        }
        final BigDecimal currentCost = resolvedCost;
        final BigDecimal appliedCost = Optional.ofNullable(request.getProblemCostContribution()).orElse(BigDecimal.ZERO);
        if (currentCost.compareTo(appliedCost) == 0) {
            return;
        }
        boolean updatedProblem = problemRepository.findById(problem.getId()).map(managed -> {
            BigDecimal totalCost = Optional.ofNullable(managed.getTotalCost()).orElse(BigDecimal.ZERO);
            BigDecimal nextTotal = totalCost.add(currentCost.subtract(appliedCost));
            if (nextTotal.compareTo(BigDecimal.ZERO) < 0) {
                nextTotal = BigDecimal.ZERO;
            }
            managed.setTotalCost(nextTotal);
            problemRepository.save(managed);
            request.setProblemCostContribution(currentCost);
            return true;
        }).orElse(false);
        if (!updatedProblem) {
            log.warn("Não foi possível atualizar o custo do problema {} para a solicitação {}", problem.getId(), request.getId());
            request.setProblemCostContribution(currentCost);
        }
    }

    private ProblemRecord resolveProblemAssociation(Long problemId, String environmentName) {
        if (problemId == null) {
            return null;
        }
        ProblemRecord problem = problemRepository.findById(problemId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Problema selecionado não existe"));
        if (problem.getFinalizedAt() != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Problema selecionado já foi finalizado");
        }
        EnvironmentRecord problemEnvironment = problem.getEnvironment();
        if (problemEnvironment == null || !StringUtils.hasText(problemEnvironment.getName())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Problema selecionado não está vinculado a um ambiente");
        }
        if (!StringUtils.hasText(environmentName) || !problemEnvironment.getName().equalsIgnoreCase(environmentName.trim())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Problema selecionado não pertence ao ambiente informado");
        }
        return problem;
    }

    private record PromptMetadata(String repo, String branch, Long runId, Integer prNumber) {}

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

    private record RefreshDecision(boolean shouldRefresh, String reason) {
        private static RefreshDecision skip() {
            return new RefreshDecision(false, "dados completos");
        }

        private static RefreshDecision skip(String reason) {
            return new RefreshDecision(false, reason);
        }
    }

    private void recordHttpRequests(CodexRequest request, SandboxOrchestratorClient.SandboxOrchestratorJobResponse response) {
        if (request == null || request.getId() == null || response == null || response.httpRequests() == null) {
            return;
        }

        String sandboxJobId = Optional.ofNullable(response.jobId()).orElse(request.getExternalId());
        if (!StringUtils.hasText(sandboxJobId)) {
            sandboxJobId = "unknown-" + request.getId();
        }

        for (SandboxOrchestratorClient.SandboxOrchestratorJobResponse.HttpRequest httpRequest : response.httpRequests()) {
            if (httpRequest == null || !StringUtils.hasText(httpRequest.url())) {
                continue;
            }

            String callId = Optional.ofNullable(httpRequest.callId())
                .map(String::trim)
                .filter(StringUtils::hasText)
                .orElse(buildSyntheticCallId(httpRequest, sandboxJobId));
            if (codexHttpRequestRepository.existsBySandboxJobIdAndSandboxCallId(sandboxJobId, callId)) {
                continue;
            }

            Instant requestedAt = parseInstant(httpRequest.requestedAt());
            CodexHttpRequestLog logRecord = new CodexHttpRequestLog(
                request,
                sandboxJobId,
                callId,
                httpRequest.url().trim(),
                httpRequest.status(),
                httpRequest.success(),
                httpRequest.toolName(),
                requestedAt
            );
            codexHttpRequestRepository.save(logRecord);
        }
    }

    private String buildSyntheticCallId(SandboxOrchestratorClient.SandboxOrchestratorJobResponse.HttpRequest httpRequest, String sandboxJobId) {
        String seed = sandboxJobId + "|" + Optional.ofNullable(httpRequest.url()).orElse("") + "|" + Optional.ofNullable(httpRequest.requestedAt()).orElse("");
        return UUID.nameUUIDFromBytes(seed.getBytes(StandardCharsets.UTF_8)).toString();
    }

    private void recordInteractions(CodexRequest request, SandboxOrchestratorClient.SandboxOrchestratorJobResponse response) {
        if (request == null || request.getId() == null || response == null || response.interactions() == null) {
            return;
        }

        int baseCount = request.getInteractionCount() != null
            ? request.getInteractionCount()
            : codexInteractionRepository.countByCodexRequestId(request.getId());
        int inserted = 0;

        for (SandboxOrchestratorClient.SandboxOrchestratorJobResponse.Interaction interaction : response.interactions()) {
            if (interaction == null) {
                continue;
            }

            String sandboxInteractionId = Optional.ofNullable(interaction.id())
                .map(String::trim)
                .filter(StringUtils::hasText)
                .orElse(null);
            if (sandboxInteractionId == null) {
                continue;
            }
            if (codexInteractionRepository.existsBySandboxInteractionId(sandboxInteractionId)) {
                continue;
            }

            String content = Optional.ofNullable(interaction.content()).map(String::trim).orElse("");
            Integer sequence = interaction.sequence();
            if (sequence == null) {
                sequence = baseCount + inserted + 1;
            }
            Instant createdAt = parseInstant(interaction.createdAt());
            CodexInteractionRecord record = new CodexInteractionRecord(
                request,
                sandboxInteractionId,
                CodexInteractionDirection.fromSandboxValue(interaction.direction()),
                content,
                interaction.tokenCount(),
                sequence,
                createdAt
            );
            codexInteractionRepository.save(record);
            inserted++;
        }

        if (inserted > 0 || request.getInteractionCount() == null) {
            updateInteractionCount(request);
        }
    }

    private void updateInteractionCount(CodexRequest request) {
        if (request == null || request.getId() == null) {
            return;
        }
        request.setInteractionCount(codexInteractionRepository.countByCodexRequestId(request.getId()));
    }

    private void applyInteractionCounts(List<CodexRequest> requests) {
        if (requests == null || requests.isEmpty()) {
            return;
        }

        List<Long> ids = new ArrayList<>();
        for (CodexRequest request : requests) {
            if (request.getId() != null) {
                ids.add(request.getId());
            } else {
                request.setInteractionCount(0);
            }
        }

        if (ids.isEmpty()) {
            return;
        }

        Map<Long, Integer> counts = new HashMap<>();
        for (Object[] row : codexInteractionRepository.countByCodexRequestIds(ids)) {
            if (row == null || row.length < 2) {
                continue;
            }
            Long requestId = null;
            if (row[0] instanceof Number) {
                requestId = ((Number) row[0]).longValue();
            } else if (row[0] instanceof String) {
                try {
                    requestId = Long.parseLong(((String) row[0]).trim());
                } catch (NumberFormatException ignored) {
                    requestId = null;
                }
            }
            Number total = row[1] instanceof Number ? (Number) row[1] : null;
            if (requestId != null) {
                counts.put(requestId, total != null ? total.intValue() : 0);
            }
        }

        for (CodexRequest request : requests) {
            Long requestId = request.getId();
            if (requestId == null) {
                continue;
            }
            request.setInteractionCount(counts.getOrDefault(requestId, 0));
        }
    }

}
