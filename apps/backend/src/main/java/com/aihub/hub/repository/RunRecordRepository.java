package com.aihub.hub.repository;

import com.aihub.hub.domain.RunRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface RunRecordRepository extends JpaRepository<RunRecord, Long> {
    Optional<RunRecord> findByRepoAndRunIdAndAttempt(String repo, long runId, int attempt);
    List<RunRecord> findTop10ByRepoOrderByCreatedAtDesc(String repo);
}
