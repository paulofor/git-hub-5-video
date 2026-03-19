package com.aihub.hub.service;

import com.aihub.hub.domain.Blueprint;
import com.aihub.hub.domain.Project;
import com.aihub.hub.dto.CreateProjectRequest;
import com.aihub.hub.github.GithubApiClient;
import com.aihub.hub.repository.BlueprintRepository;
import com.aihub.hub.repository.ProjectRepository;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.Map;

@Service
public class ProjectService {

    private final ProjectRepository projectRepository;
    private final BlueprintRepository blueprintRepository;
    private final GithubApiClient githubApiClient;
    private final AuditService auditService;
    private final String webhookUrl;
    private final String webhookSecret;

    public ProjectService(ProjectRepository projectRepository,
                          BlueprintRepository blueprintRepository,
                          GithubApiClient githubApiClient,
                          AuditService auditService,
                          @Value("${HUB_PUBLIC_URL:http://localhost:8081}") String publicUrl,
                          @Value("${hub.github.webhook-secret:${GITHUB_WEBHOOK_SECRET:}}") String webhookSecret) {
        this.projectRepository = projectRepository;
        this.blueprintRepository = blueprintRepository;
        this.githubApiClient = githubApiClient;
        this.auditService = auditService;
        this.webhookUrl = publicUrl.endsWith("/") ? publicUrl + "webhooks/github" : publicUrl + "/webhooks/github";
        this.webhookSecret = webhookSecret;
    }

    @Transactional
    public Project createProject(String actor, CreateProjectRequest request) {
        Blueprint blueprint = blueprintRepository.findByNameIgnoreCase(request.getBlueprint())
            .orElseThrow(() -> new IllegalArgumentException("Blueprint não encontrada"));
        String repoName = request.getName();
        String owner = request.getOrg();
        boolean isPrivate = request.getIsPrivate();
        JsonNode repoResponse;
        if (request.isUseTemplate() && request.getTemplateOwner() != null && request.getTemplateRepo() != null) {
            repoResponse = githubApiClient.createRepositoryFromTemplate(request.getTemplateOwner(), request.getTemplateRepo(), owner, repoName, isPrivate);
        } else {
            repoResponse = githubApiClient.createRepository(owner, repoName, isPrivate);
            Map<String, String> templates = blueprint.getTemplates() != null ? blueprint.getTemplates().toMap() : Map.of();
            templates.forEach((path, content) -> {
                String rendered = renderTemplate(content, owner, repoName);
                githubApiClient.uploadContent(owner, repoName, path, "Bootstrap blueprint", rendered, null, null);
            });
        }
        githubApiClient.createWebhook(owner, repoName, webhookSecret, webhookUrl);
        Project project = new Project(owner, owner + "/" + repoName, isPrivate);
        project.setBlueprint(blueprint);
        project.setRepoUrl(repoResponse.get("html_url").asText());
        Project saved = projectRepository.save(project);
        Map<String, Object> payload = new HashMap<>();
        payload.put("repo", project.getRepo());
        payload.put("blueprint", blueprint.getName());
        auditService.record(actor, "create_project", project.getRepo(), payload);
        return saved;
    }

    private String renderTemplate(String template, String org, String repo) {
        return template
            .replace("{{org}}", org)
            .replace("{{repo}}", repo)
            .replace("{{repo_name}}", repo)
            .replace("{{organization}}", org);
    }
}
