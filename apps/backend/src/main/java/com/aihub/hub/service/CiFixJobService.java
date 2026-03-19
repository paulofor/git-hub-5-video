package com.aihub.hub.service;

import com.aihub.hub.domain.CiFixJobRecord;
import com.aihub.hub.domain.Project;
import com.aihub.hub.dto.CiFixJobView;
import com.aihub.hub.dto.CreateCiFixJobRequest;
import com.aihub.hub.repository.CiFixJobRepository;
import com.aihub.hub.repository.ProjectRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Service
public class CiFixJobService {

    private final ProjectRepository projectRepository;
    private final CiFixJobRepository jobRepository;
    private final SandboxOrchestratorClient sandboxOrchestratorClient;
    private final AuditService auditService;

    public CiFixJobService(ProjectRepository projectRepository,
                           CiFixJobRepository jobRepository,
                           SandboxOrchestratorClient sandboxOrchestratorClient,
                           AuditService auditService) {
        this.projectRepository = projectRepository;
        this.jobRepository = jobRepository;
        this.sandboxOrchestratorClient = sandboxOrchestratorClient;
        this.auditService = auditService;
    }

    @Transactional
    public CiFixJobView createJob(String actor, CreateCiFixJobRequest request) {
        Project project = projectRepository.findById(request.getProjectId())
            .orElseThrow(() -> new IllegalArgumentException("Projeto não encontrado"));
        if (project.getRepoUrl() == null || project.getRepoUrl().isBlank()) {
            throw new IllegalStateException("Project.repoUrl não configurado para o projeto solicitado");
        }

        String branch = request.getBranch() != null && !request.getBranch().isBlank()
            ? request.getBranch().trim()
            : "main";

        CiFixJobRecord record = new CiFixJobRecord();
        record.setJobId(UUID.randomUUID().toString());
        record.setProject(project);
        record.setBranch(branch);
        record.setCommitHash(request.getCommitHash());
        record.setTaskDescription(request.getTaskDescription());
        record.setTestCommand(request.getTestCommand());
        record.setStatus("PENDING");
        record.setUpdatedAt(Instant.now());
        jobRepository.save(record);

        SandboxJobRequest jobRequest = new SandboxJobRequest(
            record.getJobId(),
            project.getRepo(),
            project.getRepoUrl(),
            branch,
            request.getTaskDescription(),
            request.getCommitHash(),
            request.getTestCommand(),
            null,
            null,
            null,
            null,
            null
        );

        try {
            SandboxOrchestratorClient.SandboxOrchestratorJobResponse orchestratorResponse =
                sandboxOrchestratorClient.createJob(jobRequest);
            populateFromOrchestrator(record, orchestratorResponse);
        } catch (RuntimeException ex) {
            record.setStatus("FAILED");
            String message = ex.getMessage() != null
                ? ex.getMessage()
                : "Falha ao criar job no sandbox-orchestrator";
            record.setSummary("Falha ao criar job no sandbox-orchestrator: " + message);
        }

        jobRepository.save(record);

        auditService.record(actor, "cifix_job_created", project.getRepo(), null);
        return CiFixJobView.from(record);
    }

    @Transactional(readOnly = true)
    public CiFixJobView getJob(String jobId) {
        CiFixJobRecord record = jobRepository.findByJobId(jobId)
            .orElseThrow(() -> new IllegalArgumentException("Job não encontrado"));
        return CiFixJobView.from(record);
    }

    @Transactional
    public CiFixJobView refreshFromOrchestrator(String jobId) {
        CiFixJobRecord record = jobRepository.findByJobId(jobId)
            .orElseThrow(() -> new IllegalArgumentException("Job não encontrado"));

        SandboxOrchestratorClient.SandboxOrchestratorJobResponse orchestratorResponse =
            sandboxOrchestratorClient.getJob(jobId);
        populateFromOrchestrator(record, orchestratorResponse);
        record.setUpdatedAt(Instant.now());
        jobRepository.save(record);
        return CiFixJobView.from(record);
    }

    private void populateFromOrchestrator(CiFixJobRecord record, SandboxOrchestratorClient.SandboxOrchestratorJobResponse payload) {
        if (payload == null) {
            return;
        }

        Optional.ofNullable(payload.status()).ifPresent(record::setStatus);
        Optional.ofNullable(payload.summary()).ifPresent(record::setSummary);
        Optional.ofNullable(payload.patch()).ifPresent(record::setPatch);
        Optional.ofNullable(payload.pullRequestUrl()).ifPresent(record::setPullRequestUrl);
        if (payload.changedFiles() != null && !payload.changedFiles().isEmpty()) {
            String joined = String.join("\n", payload.changedFiles());
            record.setChangedFiles(joined);
        }
    }
}
