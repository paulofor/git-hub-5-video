package com.aihub.hub.service;

import com.aihub.hub.github.GithubApiClient;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;

@Component
public class RepositoryContextBuilder {

    private static final Logger log = LoggerFactory.getLogger(RepositoryContextBuilder.class);
    private final GithubApiClient githubApiClient;

    public RepositoryContextBuilder(GithubApiClient githubApiClient) {
        this.githubApiClient = githubApiClient;
    }

    public String build(String environment) {
        return build(environment, List.of());
    }

    public String build(String environment, List<String> requestedFiles) {
        RepoCoordinates coordinates = RepoCoordinates.from(environment);
        if (coordinates == null) {
            return null;
        }

        String stage = "metadados do repositório";
        try {
            log.info("Iniciando montagem do contexto do repositório {} na etapa: {}", environment, stage);
            JsonNode repository = githubApiClient.getRepository(coordinates.owner(), coordinates.repo());
            String defaultBranch = repository.path("default_branch").asText("main");
            String description = repository.path("description").asText("");

            StringBuilder builder = new StringBuilder();
            builder.append(coordinates.owner()).append("/").append(coordinates.repo());
            builder.append("\nBranch padrão: ").append(defaultBranch);
            if (description != null && !description.isBlank()) {
                builder.append("\nDescrição: ").append(description.trim());
            }

            stage = "árvore de arquivos";
            List<String> treePaths = appendTreeSummary(builder, coordinates, defaultBranch);
            stage = "README";
            appendReadmeContent(builder, coordinates, defaultBranch);
            stage = "AGENTS";
            appendAgentsContent(builder, coordinates, defaultBranch, treePaths);
            stage = "arquivos solicitados";
            appendRequestedFiles(builder, coordinates, defaultBranch, treePaths, requestedFiles);

            return builder.toString();
        } catch (Exception ex) {
            log.info("Não foi possível montar contexto do repositório {} na etapa {}: {}", environment, stage, ex.getMessage());
            return null;
        }
    }

    private List<String> appendTreeSummary(StringBuilder builder, RepoCoordinates coordinates, String branch) {
        List<String> paths = new ArrayList<>();
        try {
            log.info("Buscando árvore do repositório {}/{} na branch {}", coordinates.owner(), coordinates.repo(), branch);
            JsonNode branchData = githubApiClient.getBranch(coordinates.owner(), coordinates.repo(), branch);
            String baseSha = branchData.path("object").path("sha").asText(null);
            if (baseSha == null || baseSha.isBlank()) {
                return paths;
            }

            JsonNode tree = githubApiClient.getTree(coordinates.owner(), coordinates.repo(), baseSha, true);
            JsonNode items = tree.path("tree");
            if (items == null || !items.isArray() || items.isEmpty()) {
                return paths;
            }

            paths = StreamSupport.stream(items.spliterator(), false)
                .map(node -> node.path("path").asText(null))
                .filter(path -> path != null && !path.isBlank())
                .collect(Collectors.toList());

            if (!paths.isEmpty()) {
                builder.append("\nArquivos: ").append(paths.size());
            }
        } catch (Exception ex) {
            log.info("Falha ao obter árvore do repositório {}: {}", coordinates, ex.getMessage());
        }
        return paths;
    }

    private void appendReadmeContent(StringBuilder builder, RepoCoordinates coordinates, String branch) {
        try {
            log.info("Buscando README do repositório {}/{} na branch {}", coordinates.owner(), coordinates.repo(), branch);
            JsonNode readme = githubApiClient.getContent(coordinates.owner(), coordinates.repo(), "README.md", branch);
            String encoded = readme.path("content").asText(null);
            if (encoded == null || encoded.isBlank()) {
                return;
            }
            String content = new String(Base64.getDecoder().decode(encoded.replaceAll("\\n", "")), StandardCharsets.UTF_8);
            String trimmed = content.strip();
            if (trimmed.isEmpty()) {
                return;
            }
            builder.append("\n\nConteúdo do README:\n").append(trimmed);
        } catch (Exception ex) {
            log.info("Falha ao obter README para {}/{}: {}", coordinates.owner(), coordinates.repo(), ex.getMessage());
        }
    }

    private void appendAgentsContent(StringBuilder builder, RepoCoordinates coordinates, String branch, List<String> treePaths) {
        if (treePaths == null || treePaths.isEmpty()) {
            return;
        }
        List<String> agentFiles = treePaths.stream()
            .filter(path -> path.endsWith("AGENTS.md"))
            .collect(Collectors.toList());
        if (agentFiles.isEmpty()) {
            return;
        }

        builder.append("\n\nArquivos AGENTS.md encontrados (conteúdo ocultado):\n");
        for (String agentPath : agentFiles) {
            builder.append("- ").append(agentPath).append("\n");
        }
    }

    private void appendRequestedFiles(StringBuilder builder,
                                      RepoCoordinates coordinates,
                                      String branch,
                                      List<String> treePaths,
                                      List<String> requestedFiles) {
        if (requestedFiles == null || requestedFiles.isEmpty()) {
            return;
        }

        List<String> availablePaths = treePaths != null ? treePaths : List.of();
        List<String> normalized = requestedFiles.stream()
            .filter(path -> path != null && !path.isBlank())
            .filter(this::isRepositoryPath)
            .distinct()
            .collect(Collectors.toList());

        if (normalized.isEmpty()) {
            return;
        }

        builder.append("\n\nConteúdo de arquivos solicitados:\n");
        for (String path : normalized) {
            String content = fetchFileContent(coordinates, branch, path);

            if (content == null || content.isBlank()) {
                if (!availablePaths.isEmpty() && availablePaths.stream().noneMatch(path::equals)) {
                    builder.append("\n--- ").append(path).append(" ---\nArquivo não encontrado na árvore do repositório.");
                } else {
                    builder.append("\n--- ").append(path).append(" ---\nFalha ao carregar conteúdo.");
                }
                continue;
            }

            builder.append("\n--- ").append(path).append(" ---\n").append(content);
        }
    }

    private boolean isRepositoryPath(String path) {
        String trimmed = path != null ? path.trim() : null;
        if (trimmed == null || trimmed.isBlank()) {
            return false;
        }

        String lower = trimmed.toLowerCase();
        return !(lower.startsWith("http://") || lower.startsWith("https://") || trimmed.startsWith("//"));
    }

    private String fetchFileContent(RepoCoordinates coordinates, String branch, String path) {
        try {
            JsonNode contentNode = githubApiClient.getContent(coordinates.owner(), coordinates.repo(), path, branch);
            String encoded = contentNode.path("content").asText(null);
            if (encoded == null || encoded.isBlank()) {
                return null;
            }
            String decoded = new String(Base64.getDecoder().decode(encoded.replaceAll("\\n", "")), StandardCharsets.UTF_8).strip();
            if (decoded.length() > 6000) {
                return decoded.substring(0, 6000) + "\n... (conteúdo truncado)";
            }
            return decoded;
        } catch (Exception ex) {
            log.info("Falha ao obter conteúdo de {}: {}", path, ex.getMessage());
            return null;
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
}
