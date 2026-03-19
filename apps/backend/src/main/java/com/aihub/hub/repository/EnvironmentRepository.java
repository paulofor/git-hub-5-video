package com.aihub.hub.repository;

import com.aihub.hub.domain.EnvironmentRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface EnvironmentRepository extends JpaRepository<EnvironmentRecord, Long> {
    boolean existsByNameIgnoreCase(String name);
    Optional<EnvironmentRecord> findByNameIgnoreCase(String name);
}
