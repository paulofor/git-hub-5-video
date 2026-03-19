package com.aihub.hub.repository;

import com.aihub.hub.domain.CodexRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CodexRequestRepository extends JpaRepository<CodexRequest, Long> {
    List<CodexRequest> findAllByOrderByCreatedAtDesc();
    Page<CodexRequest> findAllByOrderByCreatedAtDesc(Pageable pageable);
    List<CodexRequest> findByProblemIdOrderByCreatedAtDesc(Long problemId);
    Optional<CodexRequest> findByExternalId(String externalId);
}
