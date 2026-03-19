package com.aihub.hub.dto;

import jakarta.validation.constraints.NotBlank;

public class CommentRequest {

    @NotBlank
    private String markdown;

    public String getMarkdown() {
        return markdown;
    }

    public void setMarkdown(String markdown) {
        this.markdown = markdown;
    }
}
