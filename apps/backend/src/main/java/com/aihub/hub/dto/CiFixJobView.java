package com.aihub.hub.dto;

import com.aihub.hub.domain.CiFixJobRecord;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;

public record CiFixJobView(
    Long id,
    String jobId,
    Long projectId,
    String repo,
    String branch,
    String commitHash,
    String taskDescription,
    String testCommand,
    String status,
    String summary,
    List<String> changedFiles,
    String patch,
    String pullRequestUrl,
    Instant createdAt,
    Instant updatedAt
) {
    public static CiFixJobView from(CiFixJobRecord record) {
        List<String> files = null;
        if (record.getChangedFiles() != null && !record.getChangedFiles().isBlank()) {
            files = Arrays.stream(record.getChangedFiles().split("\n"))
                .map(String::trim)
                .filter(it -> !it.isBlank())
                .toList();
        }

        return new CiFixJobView(
            record.getId(),
            record.getJobId(),
            record.getProject() != null ? record.getProject().getId() : null,
            record.getProject() != null ? record.getProject().getRepo() : null,
            record.getBranch(),
            record.getCommitHash(),
            record.getTaskDescription(),
            record.getTestCommand(),
            record.getStatus(),
            record.getSummary(),
            files,
            record.getPatch(),
            record.getPullRequestUrl(),
            record.getCreatedAt(),
            record.getUpdatedAt()
        );
    }
}
