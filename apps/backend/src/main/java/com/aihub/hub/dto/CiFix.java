package com.aihub.hub.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public class CiFix {

    @JsonProperty("root_cause")
    private String rootCause;

    @JsonProperty("fix_plan")
    private String fixPlan;

    @JsonProperty("unified_diff")
    private String unifiedDiff;

    private double confidence;

    public String getRootCause() {
        return rootCause;
    }

    public void setRootCause(String rootCause) {
        this.rootCause = rootCause;
    }

    public String getFixPlan() {
        return fixPlan;
    }

    public void setFixPlan(String fixPlan) {
        this.fixPlan = fixPlan;
    }

    public String getUnifiedDiff() {
        return unifiedDiff;
    }

    public void setUnifiedDiff(String unifiedDiff) {
        this.unifiedDiff = unifiedDiff;
    }

    public double getConfidence() {
        return confidence;
    }

    public void setConfidence(double confidence) {
        this.confidence = confidence;
    }
}
