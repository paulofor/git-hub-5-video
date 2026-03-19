package com.aihub.hub.repository;

import com.aihub.hub.domain.Blueprint;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface BlueprintRepository extends JpaRepository<Blueprint, Long> {
    Optional<Blueprint> findByNameIgnoreCase(String name);
}
