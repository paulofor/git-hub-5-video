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
import java.time.LocalDate;

@Entity
@Table(name = "summaries")
public class SummaryRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String repo;

    @Column(name = "range_start", nullable = false)
    private LocalDate rangeStart;

    @Column(name = "range_end", nullable = false)
    private LocalDate rangeEnd;

    @Column(nullable = false)
    private String granularity;

    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(nullable = false, columnDefinition = "LONGTEXT")
    private String content;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public SummaryRecord() {
    }

    public SummaryRecord(String repo, LocalDate rangeStart, LocalDate rangeEnd, String granularity, String content) {
        this.repo = repo;
        this.rangeStart = rangeStart;
        this.rangeEnd = rangeEnd;
        this.granularity = granularity;
        this.content = content;
    }

    public Long getId() {
        return id;
    }

    public String getRepo() {
        return repo;
    }

    public LocalDate getRangeStart() {
        return rangeStart;
    }

    public LocalDate getRangeEnd() {
        return rangeEnd;
    }

    public String getGranularity() {
        return granularity;
    }

    public String getContent() {
        return content;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
