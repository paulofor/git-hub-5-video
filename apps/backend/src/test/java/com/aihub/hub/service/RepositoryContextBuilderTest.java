package com.aihub.hub.service;

import com.aihub.hub.github.GithubApiClient;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class RepositoryContextBuilderTest {

    private final GithubApiClient githubApiClient = Mockito.mock(GithubApiClient.class);
    private final RepositoryContextBuilder contextBuilder = new RepositoryContextBuilder(githubApiClient);
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void shouldFetchRequestedFileEvenWhenMissingFromTree() throws Exception {
        Mockito.when(githubApiClient.getRepository("owner", "repo"))
            .thenReturn(json("{\"default_branch\":\"main\",\"description\":\"\"}"));
        Mockito.when(githubApiClient.getBranch("owner", "repo", "main"))
            .thenReturn(json("{\"object\":{\"sha\":\"commit-sha\"}}"));
        Mockito.when(githubApiClient.getTree("owner", "repo", "commit-sha", true))
            .thenReturn(json("{\"tree\":[{\"path\":\"README.md\"}]}"));
        Mockito.when(githubApiClient.getContent("owner", "repo", "README.md", "main"))
            .thenReturn(json("{\"content\":\"\"}"));

        String encoded = Base64.getEncoder().encodeToString("requested file content".getBytes(StandardCharsets.UTF_8));
        Mockito.when(githubApiClient.getContent("owner", "repo", "src/App.java", "main"))
            .thenReturn(json("{\"content\":\"" + encoded + "\"}"));

        String context = contextBuilder.build("owner/repo", List.of("src/App.java"));

        assertTrue(context.contains("requested file content"));
        assertFalse(context.contains("Arquivo não encontrado na árvore do repositório."));
    }

    @Test
    void shouldIgnoreRequestedUrls() throws Exception {
        Mockito.when(githubApiClient.getRepository("owner", "repo"))
            .thenReturn(json("{\"default_branch\":\"main\",\"description\":\"\"}"));
        Mockito.when(githubApiClient.getBranch("owner", "repo", "main"))
            .thenReturn(json("{\"object\":{\"sha\":\"commit-sha\"}}"));
        Mockito.when(githubApiClient.getTree("owner", "repo", "commit-sha", true))
            .thenReturn(json("{\"tree\":[{\"path\":\"README.md\"}]}"));
        Mockito.when(githubApiClient.getContent("owner", "repo", "README.md", "main"))
            .thenReturn(json("{\"content\":\"\"}"));

        String encoded = Base64.getEncoder().encodeToString("requested file content".getBytes(StandardCharsets.UTF_8));
        Mockito.when(githubApiClient.getContent("owner", "repo", "src/App.java", "main"))
            .thenReturn(json("{\"content\":\"" + encoded + "\"}"));

        String context = contextBuilder.build("owner/repo", List.of("https://example.com/data.json", "//external-host", "src/App.java"));

        assertTrue(context.contains("requested file content"));
        verify(githubApiClient, never()).getContent("owner", "repo", "https://example.com/data.json", "main");
        verify(githubApiClient, never()).getContent("owner", "repo", "//external-host", "main");
    }

    private JsonNode json(String content) throws Exception {
        return objectMapper.readTree(content);
    }
}
