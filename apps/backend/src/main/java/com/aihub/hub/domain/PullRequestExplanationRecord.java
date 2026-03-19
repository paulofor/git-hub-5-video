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
@Table(name = "pull_request_explanations")
public class PullRequestExplanationRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String repo;

    @Column(name = "pr_number", nullable = false)
    private Integer prNumber;

    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(nullable = false, columnDefinition = "LONGTEXT")
    private String explanation;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public PullRequestExplanationRecord() {
    }

    public PullRequestExplanationRecord(String repo, Integer prNumber, String explanation) {
        this.repo = repo;
        this.prNumber = prNumber;
        this.explanation = explanation;
    }

    public Long getId() {
        return id;
    }

    public String getRepo() {
        return repo;
    }

    public Integer getPrNumber() {
        return prNumber;
    }

    public String getExplanation() {
        return explanation;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
