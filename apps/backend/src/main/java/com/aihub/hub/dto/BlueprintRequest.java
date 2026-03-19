package com.aihub.hub.dto;

import jakarta.validation.constraints.NotBlank;

import java.util.Map;

public class BlueprintRequest {

    @NotBlank
    private String name;

    private String description;

    private Map<String, String> templates;

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public Map<String, String> getTemplates() {
        return templates;
    }

    public void setTemplates(Map<String, String> templates) {
        this.templates = templates;
    }
}
