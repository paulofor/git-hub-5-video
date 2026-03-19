package com.aihub.hub.service;

import com.aihub.hub.domain.Project;
import com.aihub.hub.dto.CiFixJobView;
import com.aihub.hub.dto.CreateCiFixJobRequest;
import com.aihub.hub.github.GithubApiClient;
import com.aihub.hub.repository.ProjectRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@Service
public class CiAnalysisService {

    private final GithubApiClient githubApiClient;
    private final ProjectRepository projectRepository;
    private final CiFixJobService ciFixJobService;
    private final int maxChars;

    public CiAnalysisService(GithubApiClient githubApiClient,
                              ProjectRepository projectRepository,
                              CiFixJobService ciFixJobService,
                              @Value("${hub.logs.max-chars:20000}") int maxChars) {
        this.githubApiClient = githubApiClient;
        this.projectRepository = projectRepository;
        this.ciFixJobService = ciFixJobService;
        this.maxChars = maxChars;
    }

    public CiFixJobView analyze(String actor, String owner, String repo, long runId, Integer prNumber) {
        byte[] zip = githubApiClient.downloadRunLogs(owner, repo, runId);
        String logs = sanitizeLogs(extractLogs(zip));
        if (logs.length() > maxChars) {
            logs = logs.substring(0, maxChars) + "\n...[truncado]";
        }
        Project project = projectRepository.findByRepo(owner + "/" + repo)
            .orElseThrow(() -> new IllegalArgumentException("Projeto não encontrado"));

        CreateCiFixJobRequest request = new CreateCiFixJobRequest();
        request.setProjectId(project.getId());
        request.setBranch("main");
        request.setTaskDescription(buildPrompt(repo, runId, prNumber, logs));
        return ciFixJobService.createJob(actor, request);
    }

    private String buildPrompt(String repo, long runId, Integer prNumber, String logs) {
        StringBuilder builder = new StringBuilder();
        builder.append("Analise a execução do workflow do repositório ").append(repo)
            .append(" run ").append(runId);
        if (prNumber != null) {
            builder.append(" associado ao PR #").append(prNumber);
        }
        builder.append(". Responda no schema solicitado.\nLogs:\n").append(logs);
        return builder.toString();
    }

    private String sanitizeLogs(String rawLogs) {
        return rawLogs
            .replaceAll("ghs_[A-Za-z0-9]+", "[REDACTED_TOKEN]")
            .replaceAll("gho_[A-Za-z0-9]+", "[REDACTED_TOKEN]")
            .replaceAll("AKIA[0-9A-Z]{16}", "[REDACTED_AWS]");
    }

    private String extractLogs(byte[] zip) {
        StringBuilder builder = new StringBuilder();
        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zip))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                if (builder.length() > maxChars) {
                    break;
                }
                builder.append("===== ").append(entry.getName()).append(" =====\n");
                builder.append(readEntry(zis));
                builder.append("\n");
            }
        } catch (IOException e) {
            throw new IllegalStateException("Falha ao ler logs de workflow", e);
        }
        return builder.toString();
    }

    private String readEntry(ZipInputStream zis) throws IOException {
        StringBuilder builder = new StringBuilder();
        byte[] buffer = new byte[4096];
        int len;
        while ((len = zis.read(buffer)) > 0) {
            builder.append(new String(buffer, 0, len, StandardCharsets.UTF_8));
            if (builder.length() > maxChars) {
                break;
            }
        }
        return builder.toString();
    }
}
