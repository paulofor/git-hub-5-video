package com.aihub.hub.repository;

import com.aihub.hub.domain.CiFixJobRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface CiFixJobRepository extends JpaRepository<CiFixJobRecord, Long> {
    Optional<CiFixJobRecord> findByJobId(String jobId);
}
