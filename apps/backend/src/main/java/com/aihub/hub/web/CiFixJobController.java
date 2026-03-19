package com.aihub.hub.web;

import com.aihub.hub.dto.CiFixJobView;
import com.aihub.hub.dto.CreateCiFixJobRequest;
import com.aihub.hub.service.CiFixJobService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/cifix/jobs")
public class CiFixJobController {

    private final CiFixJobService ciFixJobService;

    public CiFixJobController(CiFixJobService ciFixJobService) {
        this.ciFixJobService = ciFixJobService;
    }

    @PostMapping
    public ResponseEntity<CiFixJobView> createJob(@RequestHeader(value = "X-Role", defaultValue = "viewer") String role,
                                                  @RequestHeader(value = "X-User", defaultValue = "unknown") String actor,
                                                  @Valid @RequestBody CreateCiFixJobRequest request) {
        assertOwner(role);
        return ResponseEntity.ok(ciFixJobService.createJob(actor, request));
    }

    @GetMapping("/{jobId}")
    public ResponseEntity<CiFixJobView> getJob(@PathVariable String jobId,
                                               @RequestParam(value = "refresh", required = false, defaultValue = "false") boolean refresh) {
        if (refresh) {
            return ResponseEntity.ok(ciFixJobService.refreshFromOrchestrator(jobId));
        }
        return ResponseEntity.ok(ciFixJobService.getJob(jobId));
    }

    private void assertOwner(String role) {
        if (!"owner".equalsIgnoreCase(role)) {
            throw new IllegalStateException("Ação requer confirmação de um owner");
        }
    }
}
