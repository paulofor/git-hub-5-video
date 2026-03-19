package com.aihub.hub.repository;

import com.aihub.hub.domain.CodexHttpRequestLog;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CodexHttpRequestRepository extends JpaRepository<CodexHttpRequestLog, Long> {
    boolean existsBySandboxJobIdAndSandboxCallId(String sandboxJobId, String sandboxCallId);
}
