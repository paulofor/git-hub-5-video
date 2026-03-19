package com.aihub.hub.dto;

import jakarta.validation.constraints.Size;

public class SaveCodexCommentRequest {

    @Size(max = 4000, message = "Comentário deve ter no máximo 4000 caracteres")
    private String comment;

    @Size(max = 4000, message = "Descrição do problema deve ter no máximo 4000 caracteres")
    private String problemDescription;

    @Size(max = 4000, message = "Dificuldade de resolução deve ter no máximo 4000 caracteres")
    private String resolutionDifficulty;

    @Size(max = 200000, message = "Log deve ter no máximo 200000 caracteres")
    private String executionLog;

    public String getComment() {
        return comment;
    }

    public void setComment(String comment) {
        this.comment = comment;
    }

    public String getProblemDescription() {
        return problemDescription;
    }

    public void setProblemDescription(String problemDescription) {
        this.problemDescription = problemDescription;
    }

    public String getResolutionDifficulty() {
        return resolutionDifficulty;
    }

    public void setResolutionDifficulty(String resolutionDifficulty) {
        this.resolutionDifficulty = resolutionDifficulty;
    }

    public String getExecutionLog() {
        return executionLog;
    }

    public void setExecutionLog(String executionLog) {
        this.executionLog = executionLog;
    }
}
