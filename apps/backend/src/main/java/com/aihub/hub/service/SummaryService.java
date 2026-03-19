package com.aihub.hub.service;

import com.aihub.hub.domain.SummaryRecord;
import com.aihub.hub.dto.GenerateSummaryRequest;
import com.aihub.hub.repository.ResponseRepository;
import com.aihub.hub.repository.SummaryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;

@Service
public class SummaryService {

    private final SummaryRepository summaryRepository;
    private final ResponseRepository responseRepository;
    private final AuditService auditService;

    public SummaryService(SummaryRepository summaryRepository, ResponseRepository responseRepository, AuditService auditService) {
        this.summaryRepository = summaryRepository;
        this.responseRepository = responseRepository;
        this.auditService = auditService;
    }

    @Transactional
    public SummaryRecord generate(String actor, GenerateSummaryRequest request) {
        LocalDate start = request.getRangeStart();
        LocalDate end = request.getRangeEnd();
        String repo = request.getRepo();
        long count = repo == null ? responseRepository.count() : responseRepository.findTop10ByRepoOrderByCreatedAtDesc(repo).size();
        String content = "Resumo " + request.getGranularity() + " de " + start + " a " + end + ": " + count + " respostas analisadas.";
        SummaryRecord summary = new SummaryRecord(repo, start, end, request.getGranularity(), content);
        SummaryRecord saved = summaryRepository.save(summary);
        Map<String, Object> payload = new HashMap<>();
        payload.put("repo", repo);
        payload.put("range", start + "-" + end);
        auditService.record(actor, "generate_summary", repo, payload);
        return saved;
    }
}
