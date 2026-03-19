package com.aihub.hub.repository;

import com.aihub.hub.domain.ResponseRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ResponseRepository extends JpaRepository<ResponseRecord, Long> {
    List<ResponseRecord> findTop10ByRepoOrderByCreatedAtDesc(String repo);

    Optional<ResponseRecord> findTopByRepoAndRunIdAndPrNumberOrderByCreatedAtDesc(String repo, Long runId, Integer prNumber);

    Optional<ResponseRecord> findTopByRepoAndRunIdOrderByCreatedAtDesc(String repo, Long runId);

    Optional<ResponseRecord> findTopByRepoAndPrNumberOrderByCreatedAtDesc(String repo, Integer prNumber);

    Optional<ResponseRecord> findTopByRepoOrderByCreatedAtDesc(String repo);
}
