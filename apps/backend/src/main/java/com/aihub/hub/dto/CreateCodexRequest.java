package com.aihub.hub.dto;

import com.aihub.hub.domain.CodexIntegrationProfile;
import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;

public class CreateCodexRequest {

    @NotBlank
    private String environment;

    @NotBlank
    private String prompt;

    private String model;

    private CodexIntegrationProfile profile;

    private Long problemId;

    private Integer promptTokens;

    private Integer cachedPromptTokens;

    private Integer completionTokens;

    private Integer totalTokens;

    private BigDecimal promptCost;

    private BigDecimal cachedPromptCost;

    private BigDecimal completionCost;

    private BigDecimal cost;

    public CreateCodexRequest() {
    }

    public String getEnvironment() {
        return environment;
    }

    public void setEnvironment(String environment) {
        this.environment = environment;
    }

    public String getPrompt() {
        return prompt;
    }

    public void setPrompt(String prompt) {
        this.prompt = prompt;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public CodexIntegrationProfile getProfile() {
        return profile;
    }

    public void setProfile(CodexIntegrationProfile profile) {
        this.profile = profile;
    }

    public Long getProblemId() {
        return problemId;
    }

    public void setProblemId(Long problemId) {
        this.problemId = problemId;
    }

    public Integer getPromptTokens() {
        return promptTokens;
    }

    public void setPromptTokens(Integer promptTokens) {
        this.promptTokens = promptTokens;
    }

    public Integer getCachedPromptTokens() {
        return cachedPromptTokens;
    }

    public void setCachedPromptTokens(Integer cachedPromptTokens) {
        this.cachedPromptTokens = cachedPromptTokens;
    }

    public Integer getCompletionTokens() {
        return completionTokens;
    }

    public void setCompletionTokens(Integer completionTokens) {
        this.completionTokens = completionTokens;
    }

    public Integer getTotalTokens() {
        return totalTokens;
    }

    public void setTotalTokens(Integer totalTokens) {
        this.totalTokens = totalTokens;
    }

    public BigDecimal getPromptCost() {
        return promptCost;
    }

    public void setPromptCost(BigDecimal promptCost) {
        this.promptCost = promptCost;
    }

    public BigDecimal getCachedPromptCost() {
        return cachedPromptCost;
    }

    public void setCachedPromptCost(BigDecimal cachedPromptCost) {
        this.cachedPromptCost = cachedPromptCost;
    }

    public BigDecimal getCompletionCost() {
        return completionCost;
    }

    public void setCompletionCost(BigDecimal completionCost) {
        this.completionCost = completionCost;
    }

    public BigDecimal getCost() {
        return cost;
    }

    public void setCost(BigDecimal cost) {
        this.cost = cost;
    }
}
