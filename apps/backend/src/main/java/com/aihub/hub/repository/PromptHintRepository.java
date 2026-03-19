package com.aihub.hub.repository;

import com.aihub.hub.domain.EnvironmentRecord;
import com.aihub.hub.domain.PromptHintRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PromptHintRepository extends JpaRepository<PromptHintRecord, Long> {

    List<PromptHintRecord> findAllByEnvironmentIsNullOrderByLabelAsc();

    List<PromptHintRecord> findAllByEnvironmentOrderByLabelAsc(EnvironmentRecord environment);
}
