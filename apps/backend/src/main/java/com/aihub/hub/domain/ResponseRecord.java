package com.aihub.hub.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "responses")
public class ResponseRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "prompt_id")
    private PromptRecord prompt;

    @Column(nullable = false)
    private String repo;

    @Column(name = "run_id")
    private Long runId;

    @Column(name = "pr_number")
    private Integer prNumber;

    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(columnDefinition = "LONGTEXT")
    private String rootCause;

    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(columnDefinition = "LONGTEXT")
    private String fixPlan;

    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(columnDefinition = "LONGTEXT")
    private String unifiedDiff;

    @Column(precision = 5, scale = 2)
    private BigDecimal confidence;

    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "raw_response", columnDefinition = "LONGTEXT")
    private String rawResponse;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public ResponseRecord() {
    }

    public ResponseRecord(PromptRecord prompt, String repo, Long runId, Integer prNumber) {
        this.prompt = prompt;
        this.repo = repo;
        this.runId = runId;
        this.prNumber = prNumber;
    }

    public Long getId() {
        return id;
    }

    public PromptRecord getPrompt() {
        return prompt;
    }

    public void setPrompt(PromptRecord prompt) {
        this.prompt = prompt;
    }

    public String getRepo() {
        return repo;
    }

    public void setRepo(String repo) {
        this.repo = repo;
    }

    public Long getRunId() {
        return runId;
    }

    public void setRunId(Long runId) {
        this.runId = runId;
    }

    public Integer getPrNumber() {
        return prNumber;
    }

    public void setPrNumber(Integer prNumber) {
        this.prNumber = prNumber;
    }

    public String getRootCause() {
        return rootCause;
    }

    public void setRootCause(String rootCause) {
        this.rootCause = rootCause;
    }

    public String getFixPlan() {
        return fixPlan;
    }

    public void setFixPlan(String fixPlan) {
        this.fixPlan = fixPlan;
    }

    public String getUnifiedDiff() {
        return unifiedDiff;
    }

    public void setUnifiedDiff(String unifiedDiff) {
        this.unifiedDiff = unifiedDiff;
    }

    public BigDecimal getConfidence() {
        return confidence;
    }

    public void setConfidence(BigDecimal confidence) {
        this.confidence = confidence;
    }

    public String getRawResponse() {
        return rawResponse;
    }

    public void setRawResponse(String rawResponse) {
        this.rawResponse = rawResponse;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
