package com.aihub.hub.web;

import com.aihub.hub.domain.SummaryRecord;
import com.aihub.hub.dto.GenerateSummaryRequest;
import com.aihub.hub.repository.SummaryRepository;
import com.aihub.hub.service.SummaryService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/summaries")
public class SummaryController {

    private final SummaryRepository summaryRepository;
    private final SummaryService summaryService;

    public SummaryController(SummaryRepository summaryRepository, SummaryService summaryService) {
        this.summaryRepository = summaryRepository;
        this.summaryService = summaryService;
    }

    @GetMapping
    public List<SummaryRecord> list(@RequestParam(value = "granularity", required = false) String granularity) {
        if (granularity != null) {
            return summaryRepository.findByGranularityOrderByCreatedAtDesc(granularity);
        }
        return summaryRepository.findAll();
    }

    @PostMapping("/generate")
    public ResponseEntity<SummaryRecord> generate(@RequestHeader(value = "X-Role", defaultValue = "viewer") String role,
                                                  @RequestHeader(value = "X-User", defaultValue = "unknown") String actor,
                                                  @Valid @RequestBody GenerateSummaryRequest request) {
        assertOwner(role);
        return ResponseEntity.ok(summaryService.generate(actor, request));
    }

    private void assertOwner(String role) {
        if (!"owner".equalsIgnoreCase(role)) {
            throw new IllegalStateException("Ação requer confirmação de um owner");
        }
    }
}
