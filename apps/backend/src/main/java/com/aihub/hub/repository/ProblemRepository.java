package com.aihub.hub.repository;

import com.aihub.hub.domain.ProblemRecord;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProblemRepository extends JpaRepository<ProblemRecord, Long> {
    java.util.List<ProblemRecord> findByEnvironmentIdAndFinalizedAtIsNullOrderByIncludedAtDescCreatedAtDesc(Long environmentId);
}
