package com.aihub.hub.service;

import com.aihub.hub.domain.CiFixJobRecord;
import com.aihub.hub.domain.Project;
import com.aihub.hub.dto.CiFixJobView;
import com.aihub.hub.dto.CreateCiFixJobRequest;
import com.aihub.hub.repository.CiFixJobRepository;
import com.aihub.hub.repository.ProjectRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CiFixJobServiceTest {

    private final ProjectRepository projectRepository = mock(ProjectRepository.class);
    private final CiFixJobRepository jobRepository = mock(CiFixJobRepository.class);
    private final SandboxOrchestratorClient sandboxOrchestratorClient = mock(SandboxOrchestratorClient.class);
    private final AuditService auditService = mock(AuditService.class);
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Test
    void createJobPersistsAndPropagatesToOrchestrator() {
        Project project = new Project();
        project.setRepo("owner/repo");
        project.setRepoUrl("https://github.com/owner/repo.git");
        ReflectionTestUtils.setField(project, "id", 42L);
        when(projectRepository.findById(42L)).thenReturn(Optional.of(project));
        when(jobRepository.save(org.mockito.ArgumentMatchers.any(CiFixJobRecord.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));

        ObjectNode orchestratorPayload = OBJECT_MAPPER.createObjectNode();
        orchestratorPayload.put("jobId", "job-1");
        orchestratorPayload.put("status", "RUNNING");
        orchestratorPayload.put("summary", "investigating");
        orchestratorPayload.put("patch", "diff --git");
        orchestratorPayload.putArray("changedFiles").add("README.md");
        orchestratorPayload.put("pullRequestUrl", "https://github.com/owner/repo/pull/99");
        orchestratorPayload.put("timeoutCount", 0);
        when(sandboxOrchestratorClient.createJob(org.mockito.ArgumentMatchers.any()))
            .thenReturn(SandboxOrchestratorClient.SandboxOrchestratorJobResponse.from(orchestratorPayload));

        CiFixJobService service = new CiFixJobService(projectRepository, jobRepository, sandboxOrchestratorClient, auditService);
        CreateCiFixJobRequest request = new CreateCiFixJobRequest();
        request.setProjectId(42L);
        request.setTaskDescription("look into failure");
        request.setBranch("main");
        request.setCommitHash("abc123");
        request.setTestCommand("mvn test");

        CiFixJobView view = service.createJob("alice", request);

        ArgumentCaptor<CiFixJobRecord> recordCaptor = ArgumentCaptor.forClass(CiFixJobRecord.class);
        verify(jobRepository, org.mockito.Mockito.atLeastOnce()).save(recordCaptor.capture());
        CiFixJobRecord persisted = recordCaptor.getValue();

        assertThat(view.jobId()).isEqualTo(persisted.getJobId());
        assertThat(view.status()).isEqualTo("RUNNING");
        assertThat(view.summary()).isEqualTo("investigating");
        assertThat(view.changedFiles()).containsExactly("README.md");
        assertThat(view.pullRequestUrl()).isEqualTo("https://github.com/owner/repo/pull/99");
        assertThat(persisted.getCommitHash()).isEqualTo("abc123");
        assertThat(persisted.getCreatedAt()).isBeforeOrEqualTo(Instant.now());
    }

    @Test
    void refreshJobUsesOrchestratorPayload() {
        CiFixJobRecord record = new CiFixJobRecord();
        record.setJobId("job-refresh");
        record.setStatus("PENDING");
        record.setUpdatedAt(Instant.now());

        when(jobRepository.findByJobId("job-refresh")).thenReturn(Optional.of(record));
        when(jobRepository.save(record)).thenReturn(record);

        ObjectNode refreshPayload = OBJECT_MAPPER.createObjectNode();
        refreshPayload.put("jobId", "job-refresh");
        refreshPayload.put("status", "COMPLETED");
        refreshPayload.put("summary", "done");
        refreshPayload.put("patch", "diff --git");
        refreshPayload.putArray("changedFiles").add("src/Main.java");
        refreshPayload.put("pullRequestUrl", "https://github.com/owner/repo/pull/101");
        refreshPayload.put("timeoutCount", 0);
        when(sandboxOrchestratorClient.getJob("job-refresh"))
            .thenReturn(SandboxOrchestratorClient.SandboxOrchestratorJobResponse.from(refreshPayload));

        CiFixJobService service = new CiFixJobService(projectRepository, jobRepository, sandboxOrchestratorClient, auditService);
        CiFixJobView view = service.refreshFromOrchestrator("job-refresh");

        assertThat(view.status()).isEqualTo("COMPLETED");
        assertThat(view.changedFiles()).containsExactly("src/Main.java");
        assertThat(record.getChangedFiles()).isEqualTo("src/Main.java");
        assertThat(record.getPullRequestUrl()).isEqualTo("https://github.com/owner/repo/pull/101");
    }

    @Test
    void refreshJobAcceptsSnakeCasePullRequestUrl() throws Exception {
        CiFixJobRecord record = new CiFixJobRecord();
        record.setJobId("job-refresh-snake");
        record.setStatus("PENDING");
        record.setUpdatedAt(Instant.now());

        ObjectNode payload = OBJECT_MAPPER.createObjectNode();
        payload.put("jobId", "job-refresh-snake");
        payload.put("status", "COMPLETED");
        payload.put("summary", "done");
        payload.put("patch", "diff --git");
        payload.putArray("changedFiles").add("src/Main.java");
        payload.put("pull_request_url", "https://github.com/owner/repo/pull/202");

        when(jobRepository.findByJobId("job-refresh-snake")).thenReturn(Optional.of(record));
        when(jobRepository.save(record)).thenReturn(record);
        when(sandboxOrchestratorClient.getJob("job-refresh-snake"))
            .thenReturn(SandboxOrchestratorClient.SandboxOrchestratorJobResponse.from(payload));

        CiFixJobService service = new CiFixJobService(projectRepository, jobRepository, sandboxOrchestratorClient, auditService);
        CiFixJobView view = service.refreshFromOrchestrator("job-refresh-snake");

        assertThat(view.pullRequestUrl()).isEqualTo("https://github.com/owner/repo/pull/202");
        assertThat(record.getPullRequestUrl()).isEqualTo("https://github.com/owner/repo/pull/202");
    }

    @Test
    void createJobStillPersistsWhenOrchestratorFails() {
        Project project = new Project();
        project.setRepo("owner/repo");
        project.setRepoUrl("https://github.com/owner/repo.git");
        ReflectionTestUtils.setField(project, "id", 99L);
        when(projectRepository.findById(99L)).thenReturn(Optional.of(project));
        when(jobRepository.save(org.mockito.ArgumentMatchers.any(CiFixJobRecord.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));
        when(sandboxOrchestratorClient.createJob(org.mockito.ArgumentMatchers.any()))
            .thenThrow(new RuntimeException("timeout creating job"));

        CiFixJobService service = new CiFixJobService(projectRepository, jobRepository, sandboxOrchestratorClient, auditService);
        CreateCiFixJobRequest request = new CreateCiFixJobRequest();
        request.setProjectId(99L);
        request.setTaskDescription("run analysis");

        CiFixJobView view = service.createJob("carol", request);

        ArgumentCaptor<CiFixJobRecord> recordCaptor = ArgumentCaptor.forClass(CiFixJobRecord.class);
        verify(jobRepository, org.mockito.Mockito.atLeastOnce()).save(recordCaptor.capture());
        CiFixJobRecord finalRecord = recordCaptor.getValue();

        assertThat(finalRecord.getStatus()).isEqualTo("FAILED");
        assertThat(finalRecord.getSummary()).contains("timeout creating job");
        assertThat(view.status()).isEqualTo("FAILED");
        assertThat(view.summary()).contains("timeout creating job");
    }
}
