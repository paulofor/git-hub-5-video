package com.aihub.hub.dto;

import jakarta.validation.constraints.NotBlank;

import java.util.Map;

public class DispatchWorkflowRequest {

    @NotBlank
    private String workflowFile;

    @NotBlank
    private String ref;

    private Map<String, Object> inputs;

    public String getWorkflowFile() {
        return workflowFile;
    }

    public void setWorkflowFile(String workflowFile) {
        this.workflowFile = workflowFile;
    }

    public String getRef() {
        return ref;
    }

    public void setRef(String ref) {
        this.ref = ref;
    }

    public Map<String, Object> getInputs() {
        return inputs;
    }

    public void setInputs(Map<String, Object> inputs) {
        this.inputs = inputs;
    }
}
