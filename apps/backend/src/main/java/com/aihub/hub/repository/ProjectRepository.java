package com.aihub.hub.repository;

import com.aihub.hub.domain.Project;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ProjectRepository extends JpaRepository<Project, Long> {
    Optional<Project> findByRepo(String repo);
}
