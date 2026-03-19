package com.aihub.hub.service;

public record SandboxJobRequest(
    String jobId,
    String repoSlug,
    String repoUrl,
    String branch,
    String taskDescription,
    String commitHash,
    String testCommand,
    String profile,
    String model,
    DatabaseConnection database,
    String callbackUrl,
    String callbackSecret
) {
    public record DatabaseConnection(
        String host,
        Integer port,
        String database,
        String user,
        String password
    ) { }
}
