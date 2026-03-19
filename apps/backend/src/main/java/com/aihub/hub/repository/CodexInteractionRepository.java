package com.aihub.hub.repository;

import com.aihub.hub.domain.CodexInteractionRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface CodexInteractionRepository extends JpaRepository<CodexInteractionRecord, Long> {

    boolean existsBySandboxInteractionId(String sandboxInteractionId);

    int countByCodexRequestId(Long codexRequestId);

    List<CodexInteractionRecord> findAllByCodexRequestIdOrderBySequenceAscIdAsc(Long codexRequestId);

    @Query("SELECT i.codexRequest.id, COUNT(i) FROM CodexInteractionRecord i WHERE i.codexRequest.id IN :requestIds GROUP BY i.codexRequest.id")
    List<Object[]> countByCodexRequestIds(@Param("requestIds") Collection<Long> requestIds);
}
