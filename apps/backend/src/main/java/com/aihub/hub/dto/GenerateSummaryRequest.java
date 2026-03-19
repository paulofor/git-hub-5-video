package com.aihub.hub.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public class GenerateSummaryRequest {

    private String repo;

    @NotNull
    private LocalDate rangeStart;

    @NotNull
    private LocalDate rangeEnd;

    @NotBlank
    private String granularity;

    public String getRepo() {
        return repo;
    }

    public void setRepo(String repo) {
        this.repo = repo;
    }

    public LocalDate getRangeStart() {
        return rangeStart;
    }

    public void setRangeStart(LocalDate rangeStart) {
        this.rangeStart = rangeStart;
    }

    public LocalDate getRangeEnd() {
        return rangeEnd;
    }

    public void setRangeEnd(LocalDate rangeEnd) {
        this.rangeEnd = rangeEnd;
    }

    public String getGranularity() {
        return granularity;
    }

    public void setGranularity(String granularity) {
        this.granularity = granularity;
    }
}
