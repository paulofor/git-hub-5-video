package com.aihub.hub.web;

import com.aihub.hub.dto.CreateProblemRequest;
import com.aihub.hub.dto.ProblemRequestSummaryView;
import com.aihub.hub.dto.ProblemSummaryView;
import com.aihub.hub.dto.ProblemView;
import com.aihub.hub.dto.UpdateProblemRequest;
import com.aihub.hub.service.ProblemService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/problems")
public class ProblemController {

    private final ProblemService problemService;

    public ProblemController(ProblemService problemService) {
        this.problemService = problemService;
    }

    @GetMapping
    public List<ProblemView> list() {
        return problemService.list();
    }

    @GetMapping("/active")
    public List<ProblemSummaryView> listActive(@RequestParam Long environmentId) {
        return problemService.listActiveByEnvironment(environmentId);
    }

    @GetMapping("/{id}")
    public ProblemView get(@PathVariable Long id) {
        return problemService.get(id);
    }

    @GetMapping("/{id}/requests")
    public List<ProblemRequestSummaryView> listRequestHistory(@PathVariable Long id) {
        return problemService.listRequestHistory(id);
    }

    @PostMapping
    public ProblemView create(@Valid @RequestBody CreateProblemRequest request) {
        return problemService.create(request);
    }

    @PutMapping("/{id}")
    public ProblemView update(@PathVariable Long id, @Valid @RequestBody UpdateProblemRequest request) {
        return problemService.update(id, request);
    }
}
