package com.aihub.hub.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.Instant;

@Entity
@Table(
    name = "codex_http_requests",
    uniqueConstraints = {
        @UniqueConstraint(name = "uk_codex_http_request_job_call", columnNames = {"sandbox_job_id", "sandbox_call_id"})
    }
)
public class CodexHttpRequestLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "codex_request_id", nullable = false)
    private CodexRequest codexRequest;

    @Column(name = "sandbox_job_id", nullable = false)
    private String sandboxJobId;

    @Column(name = "sandbox_call_id", nullable = false)
    private String sandboxCallId;

    @Column(name = "tool_name")
    private String toolName;

    @Column(name = "url", nullable = false, length = 2048)
    private String url;

    @Column(name = "status_code")
    private Integer statusCode;

    @Column(name = "success")
    private Boolean success;

    @Column(name = "requested_at")
    private Instant requestedAt = Instant.now();

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public CodexHttpRequestLog() {
    }

    public CodexHttpRequestLog(
        CodexRequest codexRequest,
        String sandboxJobId,
        String sandboxCallId,
        String url,
        Integer statusCode,
        Boolean success,
        String toolName,
        Instant requestedAt
    ) {
        this.codexRequest = codexRequest;
        this.sandboxJobId = sandboxJobId;
        this.sandboxCallId = sandboxCallId;
        this.url = url;
        this.statusCode = statusCode;
        this.success = success;
        this.toolName = toolName;
        this.requestedAt = requestedAt != null ? requestedAt : Instant.now();
    }

    public Long getId() {
        return id;
    }

    public CodexRequest getCodexRequest() {
        return codexRequest;
    }

    public void setCodexRequest(CodexRequest codexRequest) {
        this.codexRequest = codexRequest;
    }

    public String getSandboxJobId() {
        return sandboxJobId;
    }

    public void setSandboxJobId(String sandboxJobId) {
        this.sandboxJobId = sandboxJobId;
    }

    public String getSandboxCallId() {
        return sandboxCallId;
    }

    public void setSandboxCallId(String sandboxCallId) {
        this.sandboxCallId = sandboxCallId;
    }

    public String getToolName() {
        return toolName;
    }

    public void setToolName(String toolName) {
        this.toolName = toolName;
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public Integer getStatusCode() {
        return statusCode;
    }

    public void setStatusCode(Integer statusCode) {
        this.statusCode = statusCode;
    }

    public Boolean getSuccess() {
        return success;
    }

    public void setSuccess(Boolean success) {
        this.success = success;
    }

    public Instant getRequestedAt() {
        return requestedAt;
    }

    public void setRequestedAt(Instant requestedAt) {
        this.requestedAt = requestedAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
