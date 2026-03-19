package com.aihub.hub.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

@Entity
@Table(name = "prompts")
public class PromptRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String repo;

    @Column(nullable = false)
    private String branch;

    @Column(name = "run_id")
    private Long runId;

    @Column(name = "pr_number")
    private Integer prNumber;

    @Column(nullable = false)
    private String model;

    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(nullable = false, columnDefinition = "LONGTEXT")
    private String prompt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public PromptRecord() {
    }

    public PromptRecord(String repo, String branch, Long runId, Integer prNumber, String model, String prompt) {
        this.repo = repo;
        this.branch = branch;
        this.runId = runId;
        this.prNumber = prNumber;
        this.model = model;
        this.prompt = prompt;
    }

    public Long getId() {
        return id;
    }

    public String getRepo() {
        return repo;
    }

    public String getBranch() {
        return branch;
    }

    public Long getRunId() {
        return runId;
    }

    public Integer getPrNumber() {
        return prNumber;
    }

    public String getModel() {
        return model;
    }

    public String getPrompt() {
        return prompt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
