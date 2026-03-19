package com.aihub.hub.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
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
@Table(name = "projects")
public class Project {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String org;

    @Column(name = "repo", nullable = false, unique = true)
    private String repo;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "blueprint_id")
    private Blueprint blueprint;

    @Column(name = "is_private", nullable = false)
    private boolean isPrivate = true;

    @Column(name = "repo_url")
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    private String repoUrl;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public Project() {
    }

    public Project(String org, String repo, boolean isPrivate) {
        this.org = org;
        this.repo = repo;
        this.isPrivate = isPrivate;
    }

    public Long getId() {
        return id;
    }

    public String getOrg() {
        return org;
    }

    public void setOrg(String org) {
        this.org = org;
    }

    public String getRepo() {
        return repo;
    }

    public void setRepo(String repo) {
        this.repo = repo;
    }

    public Blueprint getBlueprint() {
        return blueprint;
    }

    public void setBlueprint(Blueprint blueprint) {
        this.blueprint = blueprint;
    }

    public boolean isPrivate() {
        return isPrivate;
    }

    public void setPrivate(boolean aPrivate) {
        isPrivate = aPrivate;
    }

    public String getRepoUrl() {
        return repoUrl;
    }

    public void setRepoUrl(String repoUrl) {
        this.repoUrl = repoUrl;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
