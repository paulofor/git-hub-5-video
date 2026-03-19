package com.aihub.hub.domain;

public enum CodexRequestStatus {
    PENDING,
    RUNNING,
    COMPLETED,
    FAILED,
    CANCELLED;

    public static CodexRequestStatus fromSandboxStatus(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        try {
            return CodexRequestStatus.valueOf(status.trim().toUpperCase());
        } catch (IllegalArgumentException ignored) {
            return null;
        }
    }

    public boolean isTerminal() {
        return this == COMPLETED || this == FAILED || this == CANCELLED;
    }
}
