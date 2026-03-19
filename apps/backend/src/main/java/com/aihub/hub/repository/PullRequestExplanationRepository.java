package com.aihub.hub.repository;

import com.aihub.hub.domain.PullRequestExplanationRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PullRequestExplanationRepository extends JpaRepository<PullRequestExplanationRecord, Long> {
    Optional<PullRequestExplanationRecord> findByRepoAndPrNumber(String repo, Integer prNumber);
}
