package com.aihub.hub.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public class CreateProjectRequest {

    @NotBlank
    private String org;

    @NotBlank
    private String name;

    @NotBlank
    private String blueprint;

    @NotNull
    private Boolean isPrivate;

    private boolean useTemplate;

    private String templateOwner;

    private String templateRepo;

    private boolean applyDefaultSecrets;

    public String getOrg() {
        return org;
    }

    public void setOrg(String org) {
        this.org = org;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getBlueprint() {
        return blueprint;
    }

    public void setBlueprint(String blueprint) {
        this.blueprint = blueprint;
    }

    public Boolean getIsPrivate() {
        return isPrivate;
    }

    public void setIsPrivate(Boolean aPrivate) {
        isPrivate = aPrivate;
    }

    public boolean isUseTemplate() {
        return useTemplate;
    }

    public void setUseTemplate(boolean useTemplate) {
        this.useTemplate = useTemplate;
    }

    public String getTemplateOwner() {
        return templateOwner;
    }

    public void setTemplateOwner(String templateOwner) {
        this.templateOwner = templateOwner;
    }

    public String getTemplateRepo() {
        return templateRepo;
    }

    public void setTemplateRepo(String templateRepo) {
        this.templateRepo = templateRepo;
    }

    public boolean isApplyDefaultSecrets() {
        return applyDefaultSecrets;
    }

    public void setApplyDefaultSecrets(boolean applyDefaultSecrets) {
        this.applyDefaultSecrets = applyDefaultSecrets;
    }
}
