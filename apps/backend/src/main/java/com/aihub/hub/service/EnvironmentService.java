package com.aihub.hub.service;

import com.aihub.hub.domain.EnvironmentRecord;
import com.aihub.hub.dto.CreateEnvironmentRequest;
import com.aihub.hub.dto.EnvironmentView;
import com.aihub.hub.dto.UpdateEnvironmentRequest;
import com.aihub.hub.repository.EnvironmentRepository;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class EnvironmentService {

    private final EnvironmentRepository environmentRepository;

    public EnvironmentService(EnvironmentRepository environmentRepository) {
        this.environmentRepository = environmentRepository;
    }

    @Transactional(readOnly = true)
    public List<EnvironmentView> listEnvironments() {
        return environmentRepository.findAll(Sort.by(Sort.Direction.ASC, "name")).stream()
            .map(EnvironmentView::from)
            .toList();
    }

    @Transactional
    public EnvironmentView createEnvironment(CreateEnvironmentRequest request) {
        String normalizedName = request.name().trim();
        if (environmentRepository.existsByNameIgnoreCase(normalizedName)) {
            throw new IllegalArgumentException("Já existe um ambiente cadastrado com esse nome.");
        }

        EnvironmentRecord record = new EnvironmentRecord();
        record.setName(normalizedName);
        record.setDescription(normalizeNullable(request.description()));
        applyConnectionData(record, request.dbHost(), request.dbPort(), request.dbName(), request.dbUser(), request.dbPassword());

        EnvironmentRecord saved = environmentRepository.save(record);
        return EnvironmentView.from(saved);
    }

    @Transactional
    public EnvironmentView updateEnvironment(Long id, UpdateEnvironmentRequest request) {
        EnvironmentRecord record = environmentRepository.findById(id)
            .orElseThrow(() -> new EntityNotFoundException("Ambiente não encontrado."));

        String normalizedName = request.name().trim();
        if (!record.getName().equalsIgnoreCase(normalizedName) && environmentRepository.existsByNameIgnoreCase(normalizedName)) {
            throw new IllegalArgumentException("Já existe um ambiente cadastrado com esse nome.");
        }

        record.setName(normalizedName);
        record.setDescription(normalizeNullable(request.description()));
        applyConnectionData(record, request.dbHost(), request.dbPort(), request.dbName(), request.dbUser(), request.dbPassword());

        EnvironmentRecord saved = environmentRepository.save(record);
        return EnvironmentView.from(saved);
    }

    private static void applyConnectionData(
        EnvironmentRecord record,
        String dbHost,
        Integer dbPort,
        String dbName,
        String dbUser,
        String dbPassword
    ) {
        record.setDbHost(normalizeNullable(dbHost));
        record.setDbPort(dbPort);
        record.setDbName(normalizeNullable(dbName));
        record.setDbUser(normalizeNullable(dbUser));
        record.setDbPassword(normalizeNullable(dbPassword));
    }

    private static String normalizeNullable(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
