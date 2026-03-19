package com.aihub.hub.web;

import com.aihub.hub.domain.Project;
import com.aihub.hub.domain.ResponseRecord;
import com.aihub.hub.domain.RunRecord;
import com.aihub.hub.dto.CiFixJobView;
import com.aihub.hub.dto.AnalyzeLogsRequest;
import com.aihub.hub.dto.CommentRequest;
import com.aihub.hub.dto.CreateFixPrRequest;
import com.aihub.hub.dto.CreateProjectRequest;
import com.aihub.hub.dto.DispatchWorkflowRequest;
import com.aihub.hub.github.GithubApiClient;
import com.aihub.hub.repository.ProjectRepository;
import com.aihub.hub.repository.ResponseRepository;
import com.aihub.hub.repository.RunRecordRepository;
import com.aihub.hub.service.CiAnalysisService;
import com.aihub.hub.service.ProjectService;
import com.aihub.hub.service.PullRequestService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/projects")
public class ProjectController {

    private final ProjectRepository projectRepository;
    private final RunRecordRepository runRepository;
    private final ResponseRepository responseRepository;
    private final ProjectService projectService;
    private final GithubApiClient githubApiClient;
    private final CiAnalysisService ciAnalysisService;
    private final PullRequestService pullRequestService;

    public ProjectController(ProjectRepository projectRepository,
                             RunRecordRepository runRepository,
                             ResponseRepository responseRepository,
                             ProjectService projectService,
                             GithubApiClient githubApiClient,
                             CiAnalysisService ciAnalysisService,
                             PullRequestService pullRequestService) {
        this.projectRepository = projectRepository;
        this.runRepository = runRepository;
        this.responseRepository = responseRepository;
        this.projectService = projectService;
        this.githubApiClient = githubApiClient;
        this.ciAnalysisService = ciAnalysisService;
        this.pullRequestService = pullRequestService;
    }

    @GetMapping
    public List<Project> list() {
        return projectRepository.findAll();
    }

    @PostMapping
    public ResponseEntity<Project> create(@RequestHeader(value = "X-Role", defaultValue = "viewer") String role,
                                          @RequestHeader(value = "X-User", defaultValue = "unknown") String actor,
                                          @Valid @RequestBody CreateProjectRequest request) {
        assertOwner(role);
        Project project = projectService.createProject(actor, request);
        return ResponseEntity.ok(project);
    }

    @GetMapping("/{owner}/{repo}")
    public ResponseEntity<Project> get(@PathVariable String owner, @PathVariable String repo) {
        return projectRepository.findByRepo(owner + "/" + repo)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/{owner}/{repo}/runs")
    public List<RunRecord> runs(@PathVariable String owner, @PathVariable String repo) {
        return runRepository.findTop10ByRepoOrderByCreatedAtDesc(owner + "/" + repo);
    }

    @GetMapping("/{owner}/{repo}/responses")
    public List<ResponseRecord> responses(@PathVariable String owner, @PathVariable String repo) {
        return responseRepository.findTop10ByRepoOrderByCreatedAtDesc(owner + "/" + repo);
    }

    @PostMapping("/{owner}/{repo}/workflows/dispatch")
    public ResponseEntity<?> dispatch(@RequestHeader(value = "X-Role", defaultValue = "viewer") String role,
                                      @RequestHeader(value = "X-User", defaultValue = "unknown") String actor,
                                      @PathVariable String owner,
                                      @PathVariable String repo,
                                      @Valid @RequestBody DispatchWorkflowRequest request) {
        assertOwner(role);
        githubApiClient.dispatchWorkflow(owner, repo, request.getWorkflowFile(), request.getRef(), request.getInputs());
        return ResponseEntity.ok(Map.of("status", "workflow dispatched"));
    }

    @PostMapping("/{owner}/{repo}/runs/{runId}/logs/analyze")
    public ResponseEntity<CiFixJobView> analyze(@RequestHeader(value = "X-Role", defaultValue = "viewer") String role,
                                                @RequestHeader(value = "X-User", defaultValue = "unknown") String actor,
                                                @PathVariable String owner,
                                                @PathVariable String repo,
                                                @PathVariable long runId,
                                                @Valid @RequestBody AnalyzeLogsRequest request) {
        assertOwner(role);
        CiFixJobView job = ciAnalysisService.analyze(actor, owner, repo, runId, request.getPrNumber());
        return ResponseEntity.ok(job);
    }

    @PostMapping("/{owner}/{repo}/pr/{number}/comment")
    public ResponseEntity<?> comment(@RequestHeader(value = "X-Role", defaultValue = "viewer") String role,
                                     @RequestHeader(value = "X-User", defaultValue = "unknown") String actor,
                                     @PathVariable String owner,
                                     @PathVariable String repo,
                                     @PathVariable int number,
                                     @Valid @RequestBody CommentRequest request) {
        assertOwner(role);
        githubApiClient.commentOnPullRequest(owner, repo, number, request.getMarkdown());
        return ResponseEntity.ok(Map.of("status", "comentário enviado"));
    }

    @PostMapping("/{owner}/{repo}/create-fix-pr")
    public ResponseEntity<?> createFixPr(@RequestHeader(value = "X-Role", defaultValue = "viewer") String role,
                                         @RequestHeader(value = "X-User", defaultValue = "unknown") String actor,
                                         @PathVariable String owner,
                                         @PathVariable String repo,
                                         @Valid @RequestBody CreateFixPrRequest request) {
        assertOwner(role);
        return ResponseEntity.ok(pullRequestService.createFixPr(
            actor,
            owner,
            repo,
            request.getBase(),
            request.getTitle(),
            request.getDiff(),
            request.getExplanation()
        ));
    }

    @GetMapping("/{owner}/{repo}/pr/{number}/explanation")
    public ResponseEntity<?> getPrExplanation(@PathVariable String owner, @PathVariable String repo, @PathVariable int number) {
        return ResponseEntity.ok(pullRequestService.getExplanation(owner, repo, number));
    }

    private void assertOwner(String role) {
        if (!"owner".equalsIgnoreCase(role)) {
            throw new IllegalStateException("Ação requer confirmação de um owner");
        }
    }
}
