package com.aihub.hub.repository;

import com.aihub.hub.domain.PromptRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PromptRepository extends JpaRepository<PromptRecord, Long> {
    Optional<PromptRecord> findTopByRepoAndRunIdAndPrNumberOrderByCreatedAtDesc(String repo, Long runId, Integer prNumber);

    Optional<PromptRecord> findTopByRepoAndRunIdOrderByCreatedAtDesc(String repo, Long runId);

    Optional<PromptRecord> findTopByRepoAndPrNumberOrderByCreatedAtDesc(String repo, Integer prNumber);

    Optional<PromptRecord> findTopByRepoOrderByCreatedAtDesc(String repo);
}
