package com.aihub.hub.domain;

public enum CodexIntegrationProfile {
    STANDARD,
    ECONOMY,
    SMART_ECONOMY,
    ECO_1,
    ECO_2,
    ECO_3,
    CHATGPT_CODEX;

    public static CodexIntegrationProfile fromString(String value) {
        if (value == null || value.isBlank()) {
            return STANDARD;
        }
        String normalized = value.trim().toUpperCase().replace('-', '_');
        try {
            return CodexIntegrationProfile.valueOf(normalized);
        } catch (IllegalArgumentException ex) {
            return STANDARD;
        }
    }
}
