package com.aihub.hub.service;

import com.aihub.hub.github.GithubApiClient;
import com.aihub.hub.domain.PullRequestExplanationRecord;
import com.aihub.hub.dto.PullRequestExplanationView;
import com.aihub.hub.repository.PullRequestExplanationRepository;
import com.aihub.hub.service.UnifiedDiffApplier.AppliedDiff;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientResponseException;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;

@Service
public class PullRequestService {

    private final GithubApiClient githubApiClient;
    private final UnifiedDiffApplier diffApplier;
    private final AuditService auditService;
    private final PullRequestExplanationRepository explanationRepository;

    public PullRequestService(GithubApiClient githubApiClient,
                             UnifiedDiffApplier diffApplier,
                             AuditService auditService,
                             PullRequestExplanationRepository explanationRepository) {
        this.githubApiClient = githubApiClient;
        this.diffApplier = diffApplier;
        this.auditService = auditService;
        this.explanationRepository = explanationRepository;
    }

    public JsonNode createFixPr(String actor,
                                String owner,
                                String repo,
                                String baseBranch,
                                String title,
                                String diff,
                                String explanation) {
        JsonNode branchData = githubApiClient.getBranch(owner, repo, baseBranch);
        String baseSha = branchData.get("object").get("sha").asText();
        String newBranch = "ai-hub/fix-" + Instant.now().getEpochSecond();
        githubApiClient.createBranch(owner, repo, newBranch, baseSha);

        Map<String, AppliedDiff> parsed = diffApplier.parse(diff);
        for (AppliedDiff fileDiff : parsed.values()) {
            String path = fileDiff.getNewPath();
            if (path == null) {
                continue;
            }
            boolean newFile = fileDiff.getOldPath() == null || fileDiff.getOldPath().contains("/dev/null");
            String existing = null;
            String sha = null;
            if (!newFile) {
                try {
                    JsonNode contentNode = githubApiClient.getContent(owner, repo, path, baseBranch);
                    String encoded = contentNode.get("content").asText().replaceAll("\n", "");
                    existing = new String(Base64.getDecoder().decode(encoded), StandardCharsets.UTF_8);
                    sha = contentNode.get("sha").asText();
                } catch (RestClientResponseException ex) {
                    existing = "";
                }
            } else {
                existing = "";
            }
            String updated = diffApplier.apply(existing, fileDiff);
            githubApiClient.uploadContent(owner, repo, path, title + " (AI Hub)", updated, newBranch, sha);
        }
        JsonNode pr = githubApiClient.createPullRequest(owner, repo, title, newBranch, baseBranch, "Correção automatizada com base na análise de logs.");
        auditService.record(actor, "create_fix_pr", owner + "/" + repo, Map.of("branch", newBranch, "title", title));
        if (pr != null && pr.has("number")) {
            PullRequestExplanationRecord record = new PullRequestExplanationRecord(owner + "/" + repo, pr.get("number").asInt(), explanation);
            explanationRepository.save(record);
        }
        return pr;
    }

    public PullRequestExplanationView getExplanation(String owner, String repo, int number) {
        return explanationRepository.findByRepoAndPrNumber(owner + "/" + repo, number)
            .map(PullRequestExplanationView::from)
            .orElseThrow(() -> new IllegalArgumentException("Explicação não encontrada para o PR informado"));
    }
}
