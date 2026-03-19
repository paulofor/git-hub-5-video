package com.aihub.hub.service;

import com.aihub.hub.domain.CodexRequest;
import com.aihub.hub.domain.EnvironmentRecord;
import com.aihub.hub.domain.ProblemRecord;
import com.aihub.hub.domain.ProblemUpdateRecord;
import com.aihub.hub.domain.Project;
import com.aihub.hub.dto.CreateProblemRequest;
import com.aihub.hub.dto.ProblemRequestSummaryView;
import com.aihub.hub.dto.ProblemUpdatePayload;
import com.aihub.hub.dto.ProblemUpdateView;
import com.aihub.hub.dto.ProblemSummaryView;
import com.aihub.hub.dto.ProblemView;
import com.aihub.hub.dto.UpdateProblemRequest;
import com.aihub.hub.repository.CodexRequestRepository;
import com.aihub.hub.repository.EnvironmentRepository;
import com.aihub.hub.repository.ProblemRepository;
import com.aihub.hub.repository.ProjectRepository;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
public class ProblemService {

    private final ProblemRepository problemRepository;
    private final CodexRequestRepository codexRequestRepository;
    private final EnvironmentRepository environmentRepository;
    private final ProjectRepository projectRepository;

    public ProblemService(ProblemRepository problemRepository,
                          CodexRequestRepository codexRequestRepository,
                          EnvironmentRepository environmentRepository,
                          ProjectRepository projectRepository) {
        this.problemRepository = problemRepository;
        this.codexRequestRepository = codexRequestRepository;
        this.environmentRepository = environmentRepository;
        this.projectRepository = projectRepository;
    }

    @Transactional(readOnly = true)
    public List<ProblemView> list() {
        Sort sort = Sort.by(Sort.Order.desc("includedAt"), Sort.Order.desc("createdAt"));
        return problemRepository.findAll(sort).stream()
            .map(this::toView)
            .toList();
    }

    @Transactional(readOnly = true)
    public ProblemView get(Long id) {
        ProblemRecord record = problemRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Problema não encontrado"));
        return toView(record);
    }

    @Transactional(readOnly = true)
    public List<ProblemSummaryView> listActiveByEnvironment(Long environmentId) {
        if (environmentId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Informe o ambiente para filtrar os problemas ativos");
        }
        EnvironmentRecord environment = environmentRepository.findById(environmentId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ambiente não encontrado"));
        return problemRepository
            .findByEnvironmentIdAndFinalizedAtIsNullOrderByIncludedAtDescCreatedAtDesc(environment.getId())
            .stream()
            .map(record -> new ProblemSummaryView(
                record.getId(),
                record.getTitle(),
                record.getIncludedAt(),
                record.getTotalCost()
            ))
            .toList();
    }


    @Transactional(readOnly = true)
    public List<ProblemRequestSummaryView> listRequestHistory(Long problemId) {
        ProblemRecord record = problemRepository.findById(problemId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Problema não encontrado"));
        return codexRequestRepository.findByProblemIdOrderByCreatedAtDesc(record.getId()).stream()
            .map(this::toRequestSummaryView)
            .toList();
    }

    @Transactional
    public ProblemView create(CreateProblemRequest request) {
        ProblemRecord record = new ProblemRecord();
        applyData(record, request.title(), request.description(), request.includedAt(), request.environmentId(), request.projectId(),
            request.dailyUpdates(), request.finalizationDescription(), request.finalizedAt());
        ProblemRecord saved = problemRepository.save(record);
        return toView(saved);
    }

    @Transactional
    public ProblemView update(Long id, UpdateProblemRequest request) {
        ProblemRecord record = problemRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Problema não encontrado"));
        applyData(record, request.title(), request.description(), request.includedAt(), request.environmentId(), request.projectId(),
            request.dailyUpdates(), request.finalizationDescription(), request.finalizedAt());
        ProblemRecord saved = problemRepository.save(record);
        return toView(saved);
    }

    private void applyData(ProblemRecord record,
                           String title,
                           String description,
                           LocalDate includedAt,
                           Long environmentId,
                           Long projectId,
                           List<ProblemUpdatePayload> updates,
                           String finalizationDescription,
                           LocalDate finalizedAt) {
        record.setTitle(title.trim());
        record.setDescription(description.trim());
        record.setIncludedAt(includedAt);

        EnvironmentRecord environment = resolveEnvironment(environmentId);
        Project project = resolveProject(projectId);

        if (environment == null && project == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Associe o problema a um ambiente ou projeto");
        }

        record.setEnvironment(environment);
        record.setProject(project);
        record.setFinalizationDescription(normalize(finalizationDescription));
        record.setFinalizedAt(finalizedAt);

        applyUpdates(record, updates);
    }

    private EnvironmentRecord resolveEnvironment(Long environmentId) {
        if (environmentId == null) {
            return null;
        }
        return environmentRepository.findById(environmentId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ambiente não encontrado"));
    }

    private Project resolveProject(Long projectId) {
        if (projectId == null) {
            return null;
        }
        return projectRepository.findById(projectId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Projeto não encontrado"));
    }

    private void applyUpdates(ProblemRecord record, List<ProblemUpdatePayload> updates) {
        record.getUpdates().clear();
        if (updates == null || updates.isEmpty()) {
            return;
        }
        List<ProblemUpdatePayload> ordered = new ArrayList<>(updates);
        ordered.sort(Comparator.comparing(ProblemUpdatePayload::entryDate));
        for (ProblemUpdatePayload payload : ordered) {
            ProblemUpdateRecord update = new ProblemUpdateRecord();
            update.setProblem(record);
            update.setEntryDate(payload.entryDate());
            update.setDescription(payload.description().trim());
            record.getUpdates().add(update);
        }
    }

    private String normalize(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private ProblemView toView(ProblemRecord record) {
        EnvironmentRecord environment = record.getEnvironment();
        Project project = record.getProject();
        List<ProblemUpdateView> updates = record.getUpdates().stream()
            .map(this::toUpdateView)
            .toList();
        return new ProblemView(
            record.getId(),
            record.getTitle(),
            record.getDescription(),
            record.getIncludedAt(),
            environment != null ? environment.getId() : null,
            environment != null ? environment.getName() : null,
            project != null ? project.getId() : null,
            project != null ? project.getRepo() : null,
            record.getTotalCost(),
            updates,
            record.getFinalizationDescription(),
            record.getFinalizedAt(),
            record.getCreatedAt(),
            record.getUpdatedAt()
        );
    }


    private ProblemRequestSummaryView toRequestSummaryView(CodexRequest request) {
        return new ProblemRequestSummaryView(
            request.getId(),
            request.getEnvironment(),
            request.getModel(),
            request.getStatus() != null ? request.getStatus().name() : null,
            request.getPrompt(),
            request.getResponseText(),
            request.getUserComment(),
            request.getProblemDescription(),
            request.getResolutionDifficulty(),
            request.getCreatedAt()
        );
    }

    private ProblemUpdateView toUpdateView(ProblemUpdateRecord record) {
        return new ProblemUpdateView(
            record.getId(),
            record.getEntryDate(),
            record.getDescription(),
            record.getCreatedAt(),
            record.getUpdatedAt()
        );
    }
}
