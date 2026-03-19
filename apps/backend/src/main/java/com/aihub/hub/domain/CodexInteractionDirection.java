package com.aihub.hub.domain;

public enum CodexInteractionDirection {
    INBOUND,
    OUTBOUND;

    public static CodexInteractionDirection fromSandboxValue(String value) {
        if (value == null) {
            return OUTBOUND;
        }
        String normalized = value.trim().toUpperCase();
        if (normalized.equals("INBOUND")) {
            return INBOUND;
        }
        return OUTBOUND;
    }
}
