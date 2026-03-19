package com.aihub.hub.repository;

import com.aihub.hub.domain.EnvironmentContainerRecord;
import com.aihub.hub.domain.EnvironmentContainerSource;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface EnvironmentContainerRepository extends JpaRepository<EnvironmentContainerRecord, Long> {

    List<EnvironmentContainerRecord> findByEnvironmentIdOrderByNameAsc(Long environmentId);

    boolean existsByEnvironmentIdAndNameIgnoreCaseAndPort(Long environmentId, String name, Integer port);

    Optional<EnvironmentContainerRecord> findByIdAndEnvironmentId(Long containerId, Long environmentId);

    @Modifying
    @Query("delete from EnvironmentContainerRecord c where c.environment.id = :environmentId and c.source = :source")
    void deleteByEnvironmentIdAndSource(@Param("environmentId") Long environmentId, @Param("source") EnvironmentContainerSource source);
}
