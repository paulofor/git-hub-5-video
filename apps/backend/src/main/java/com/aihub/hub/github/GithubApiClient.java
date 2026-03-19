package com.aihub.hub.github;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriBuilder;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.Arrays;

@Component
public class GithubApiClient {

    private static final String API_VERSION = "2022-11-28";

    private final RestClient restClient;
    private final GithubAppAuth appAuth;

    public GithubApiClient(RestClient githubRestClient, GithubAppAuth appAuth) {
        this.restClient = githubRestClient;
        this.appAuth = appAuth;
    }

    private Map<String, String> authHeaders() {
        Map<String, String> headers = new HashMap<>();
        headers.put("Authorization", "Bearer " + appAuth.getInstallationToken());
        headers.put("Accept", "application/vnd.github+json");
        headers.put("X-GitHub-Api-Version", API_VERSION);
        return headers;
    }

    public JsonNode createRepository(String org, String name, boolean isPrivate) {
        Map<String, Object> body = new HashMap<>();
        body.put("name", name);
        body.put("private", isPrivate);
        body.put("auto_init", false);
        body.put("description", "Created via AI Hub");
        return restClient.post()
            .uri("/orgs/{org}/repos", org)
            .headers(headers -> headers.setAll(authHeaders()))
            .body(body)
            .retrieve()
            .body(JsonNode.class);
    }

    public JsonNode createRepositoryFromTemplate(String owner, String templateRepo, String org, String name, boolean isPrivate) {
        Map<String, Object> body = new HashMap<>();
        body.put("owner", org);
        body.put("name", name);
        body.put("private", isPrivate);
        body.put("include_all_branches", false);
        return restClient.post()
            .uri("/repos/{owner}/{repo}/generate", owner, templateRepo)
            .headers(headers -> headers.setAll(authHeaders()))
            .body(body)
            .retrieve()
            .body(JsonNode.class);
    }

    public JsonNode uploadContent(String owner, String repo, String path, String message, String content, String branch, String sha) {
        Map<String, Object> body = new HashMap<>();
        body.put("message", message);
        body.put("content", Base64.getEncoder().encodeToString(content.getBytes(StandardCharsets.UTF_8)));
        if (branch != null) {
            body.put("branch", branch);
        }
        if (sha != null) {
            body.put("sha", sha);
        }
        return restClient.put()
            .uri(uriBuilder -> buildContentsUri(uriBuilder, owner, repo, path, null))
            .headers(headers -> headers.setAll(authHeaders()))
            .body(body)
            .retrieve()
            .body(JsonNode.class);
    }

    public JsonNode getContent(String owner, String repo, String path, String ref) {
        return restClient.get()
            .uri(uriBuilder -> buildContentsUri(uriBuilder, owner, repo, path, ref))
            .headers(headers -> headers.setAll(authHeaders()))
            .retrieve()
            .body(JsonNode.class);
    }

    public JsonNode createWebhook(String owner, String repo, String webhookSecret, String callbackUrl) {
        Map<String, Object> body = new HashMap<>();
        body.put("name", "web");
        Map<String, Object> config = new HashMap<>();
        config.put("url", callbackUrl);
        config.put("content_type", "json");
        config.put("secret", webhookSecret);
        body.put("config", config);
        body.put("events", new String[]{"workflow_run", "pull_request"});
        body.put("active", true);
        return restClient.post()
            .uri("/repos/{owner}/{repo}/hooks", owner, repo)
            .headers(headers -> headers.setAll(authHeaders()))
            .body(body)
            .retrieve()
            .body(JsonNode.class);
    }

    public void dispatchWorkflow(String owner, String repo, String workflowFile, String ref, Map<String, Object> inputs) {
        Map<String, Object> body = new HashMap<>();
        body.put("ref", ref);
        if (inputs != null && !inputs.isEmpty()) {
            body.put("inputs", inputs);
        }
        restClient.post()
            .uri("/repos/{owner}/{repo}/actions/workflows/{workflow}/dispatches", owner, repo, workflowFile)
            .headers(headers -> headers.setAll(authHeaders()))
            .body(body)
            .retrieve()
            .toBodilessEntity();
    }

    public byte[] downloadRunLogs(String owner, String repo, long runId) {
        return restClient.get()
            .uri("/repos/{owner}/{repo}/actions/runs/{runId}/logs", owner, repo, runId)
            .headers(headers -> headers.setAll(authHeaders()))
            .retrieve()
            .body(byte[].class);
    }

    public JsonNode commentOnPullRequest(String owner, String repo, int number, String markdown) {
        Map<String, Object> body = Map.of("body", markdown);
        return restClient.post()
            .uri("/repos/{owner}/{repo}/issues/{number}/comments", owner, repo, number)
            .headers(headers -> headers.setAll(authHeaders()))
            .body(body)
            .retrieve()
            .body(JsonNode.class);
    }

    public JsonNode createPullRequest(String owner, String repo, String title, String head, String base, String body) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("title", title);
        payload.put("head", head);
        payload.put("base", base);
        payload.put("body", body);
        return restClient.post()
            .uri("/repos/{owner}/{repo}/pulls", owner, repo)
            .headers(headers -> headers.setAll(authHeaders()))
            .body(payload)
            .retrieve()
            .body(JsonNode.class);
    }

    public JsonNode getRepository(String owner, String repo) {
        return restClient.get()
            .uri("/repos/{owner}/{repo}", owner, repo)
            .headers(headers -> headers.setAll(authHeaders()))
            .retrieve()
            .body(JsonNode.class);
    }

    public JsonNode getBranch(String owner, String repo, String branch) {
        return restClient.get()
            .uri("/repos/{owner}/{repo}/git/ref/heads/{branch}", owner, repo, branch)
            .headers(headers -> headers.setAll(authHeaders()))
            .retrieve()
            .body(JsonNode.class);
    }

    public JsonNode getTree(String owner, String repo, String sha, boolean recursive) {
        return restClient.get()
            .uri(uriBuilder -> {
                var builder = uriBuilder.path("/repos/{owner}/{repo}/git/trees/{sha}");
                if (recursive) {
                    builder = builder.queryParam("recursive", "1");
                }
                return builder.build(owner, repo, sha);
            })
            .headers(headers -> headers.setAll(authHeaders()))
            .retrieve()
            .body(JsonNode.class);
    }

    public JsonNode createBranch(String owner, String repo, String branch, String sha) {
        Map<String, Object> body = Map.of(
            "ref", "refs/heads/" + branch,
            "sha", sha
        );
        return restClient.post()
            .uri("/repos/{owner}/{repo}/git/refs", owner, repo)
            .headers(headers -> headers.setAll(authHeaders()))
            .body(body)
            .retrieve()
            .body(JsonNode.class);
    }

    public JsonNode getCommit(String owner, String repo, String sha) {
        return restClient.get()
            .uri("/repos/{owner}/{repo}/git/commits/{sha}", owner, repo, sha)
            .headers(headers -> headers.setAll(authHeaders()))
            .retrieve()
            .body(JsonNode.class);
    }

    public JsonNode createTree(String owner, String repo, JsonNode baseTree, Map<String, String> files) {
        Map<String, Object> body = new HashMap<>();
        body.put("base_tree", baseTree.get("sha").asText());
        var treeItems = new ArrayList<Map<String, Object>>();
        files.forEach((path, content) -> {
            Map<String, Object> item = new HashMap<>();
            item.put("path", path);
            item.put("mode", "100644");
            item.put("type", "blob");
            item.put("content", content);
            treeItems.add(item);
        });
        body.put("tree", treeItems);
        return restClient.post()
            .uri("/repos/{owner}/{repo}/git/trees", owner, repo)
            .headers(headers -> headers.setAll(authHeaders()))
            .body(body)
            .retrieve()
            .body(JsonNode.class);
    }

    public JsonNode createCommit(String owner, String repo, String message, String tree, String parentSha) {
        Map<String, Object> body = new HashMap<>();
        body.put("message", message);
        body.put("tree", tree);
        body.put("parents", new String[]{parentSha});
        return restClient.post()
            .uri("/repos/{owner}/{repo}/git/commits", owner, repo)
            .headers(headers -> headers.setAll(authHeaders()))
            .body(body)
            .retrieve()
            .body(JsonNode.class);
    }

    public void updateBranchToCommit(String owner, String repo, String branch, String sha) {
        Map<String, Object> body = new HashMap<>();
        body.put("sha", sha);
        body.put("force", false);
        restClient.patch()
            .uri("/repos/{owner}/{repo}/git/refs/heads/{branch}", owner, repo, branch)
            .headers(headers -> headers.setAll(authHeaders()))
            .body(body)
            .retrieve()
            .toBodilessEntity();
    }

    private URI buildContentsUri(UriBuilder uriBuilder, String owner, String repo, String path, String ref) {
        UriBuilder builder = uriBuilder.path("/repos/{owner}/{repo}/contents");
        String[] segments = splitPathSegments(path);
        if (segments.length > 0) {
            builder = builder.pathSegment(segments);
        }
        if (ref != null && !ref.isBlank()) {
            builder = builder.queryParam("ref", ref);
        }
        return builder.build(owner, repo);
    }

    private String[] splitPathSegments(String path) {
        if (path == null || path.isBlank()) {
            return new String[0];
        }
        return Arrays.stream(path.split("/"))
            .filter(segment -> segment != null && !segment.isBlank())
            .toArray(String[]::new);
    }
}
