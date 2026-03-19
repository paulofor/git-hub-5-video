package com.aihub.hub.domain;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "problems")
public class ProblemRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 200)
    private String title;

    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(nullable = false, columnDefinition = "LONGTEXT")
    private String description;

    @Column(name = "included_at", nullable = false)
    private LocalDate includedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "environment_id")
    private EnvironmentRecord environment;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id")
    private Project project;

    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "finalization_description", columnDefinition = "LONGTEXT")
    private String finalizationDescription;

    @Column(name = "finalized_at")
    private LocalDate finalizedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Column(name = "total_cost", precision = 19, scale = 6, nullable = false)
    private BigDecimal totalCost = BigDecimal.ZERO;

    @OneToMany(mappedBy = "problem", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("entryDate ASC, id ASC")
    private List<ProblemUpdateRecord> updates = new ArrayList<>();

    public ProblemRecord() {
    }

    @PrePersist
    public void onInsert() {
        Instant now = Instant.now();
        this.createdAt = now;
        this.updatedAt = now;
        if (this.totalCost == null) {
            this.totalCost = BigDecimal.ZERO;
        }
    }

    @PreUpdate
    public void onUpdate() {
        this.updatedAt = Instant.now();
        if (this.totalCost == null) {
            this.totalCost = BigDecimal.ZERO;
        }
    }

    public Long getId() {
        return id;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public LocalDate getIncludedAt() {
        return includedAt;
    }

    public void setIncludedAt(LocalDate includedAt) {
        this.includedAt = includedAt;
    }

    public EnvironmentRecord getEnvironment() {
        return environment;
    }

    public void setEnvironment(EnvironmentRecord environment) {
        this.environment = environment;
    }

    public Project getProject() {
        return project;
    }

    public void setProject(Project project) {
        this.project = project;
    }

    public String getFinalizationDescription() {
        return finalizationDescription;
    }

    public void setFinalizationDescription(String finalizationDescription) {
        this.finalizationDescription = finalizationDescription;
    }

    public LocalDate getFinalizedAt() {
        return finalizedAt;
    }

    public void setFinalizedAt(LocalDate finalizedAt) {
        this.finalizedAt = finalizedAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public BigDecimal getTotalCost() {
        return totalCost;
    }

    public void setTotalCost(BigDecimal totalCost) {
        this.totalCost = totalCost;
    }

    public List<ProblemUpdateRecord> getUpdates() {
        return updates;
    }

    public void setUpdates(List<ProblemUpdateRecord> updates) {
        this.updates = updates;
    }
}
