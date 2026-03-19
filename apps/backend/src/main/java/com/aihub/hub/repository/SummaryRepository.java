package com.aihub.hub.repository;

import com.aihub.hub.domain.SummaryRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface SummaryRepository extends JpaRepository<SummaryRecord, Long> {
    List<SummaryRecord> findByGranularityOrderByCreatedAtDesc(String granularity);
    List<SummaryRecord> findByRepoAndRangeStartGreaterThanEqualAndRangeEndLessThanEqualOrderByCreatedAtDesc(String repo, LocalDate start, LocalDate end);
}
