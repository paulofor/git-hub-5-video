package com.aihub.hub.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

@Entity
@Table(name = "codex_interactions")
public class CodexInteractionRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "codex_request_id", nullable = false)
    private CodexRequest codexRequest;

    @Column(name = "sandbox_interaction_id", nullable = false, unique = true, length = 191)
    private String sandboxInteractionId;

    @Enumerated(EnumType.STRING)
    @Column(name = "direction", nullable = false, length = 16)
    private CodexInteractionDirection direction;

    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "content", nullable = false, columnDefinition = "LONGTEXT")
    private String content;

    @Column(name = "token_count")
    private Integer tokenCount;

    @Column(name = "sequence", nullable = false)
    private Integer sequence;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public CodexInteractionRecord() {
    }

    public CodexInteractionRecord(
        CodexRequest codexRequest,
        String sandboxInteractionId,
        CodexInteractionDirection direction,
        String content,
        Integer tokenCount,
        Integer sequence,
        Instant createdAt
    ) {
        this.codexRequest = codexRequest;
        this.sandboxInteractionId = sandboxInteractionId;
        this.direction = direction;
        this.content = content;
        this.tokenCount = tokenCount;
        this.sequence = sequence;
        if (createdAt != null) {
            this.createdAt = createdAt;
        }
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

    public String getSandboxInteractionId() {
        return sandboxInteractionId;
    }

    public void setSandboxInteractionId(String sandboxInteractionId) {
        this.sandboxInteractionId = sandboxInteractionId;
    }

    public CodexInteractionDirection getDirection() {
        return direction;
    }

    public void setDirection(CodexInteractionDirection direction) {
        this.direction = direction;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public Integer getTokenCount() {
        return tokenCount;
    }

    public void setTokenCount(Integer tokenCount) {
        this.tokenCount = tokenCount;
    }

    public Integer getSequence() {
        return sequence;
    }

    public void setSequence(Integer sequence) {
        this.sequence = sequence;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
