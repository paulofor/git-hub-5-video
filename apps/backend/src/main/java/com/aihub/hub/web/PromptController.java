package com.aihub.hub.web;

import com.aihub.hub.domain.PromptRecord;
import com.aihub.hub.repository.PromptRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/prompts")
public class PromptController {

    private final PromptRepository promptRepository;

    public PromptController(PromptRepository promptRepository) {
        this.promptRepository = promptRepository;
    }

    @GetMapping
    public List<PromptRecord> list(@RequestParam(value = "repo", required = false) String repo) {
        List<PromptRecord> prompts = promptRepository.findAll();
        if (repo != null) {
            return prompts.stream()
                .filter(p -> repo.equalsIgnoreCase(p.getRepo()))
                .collect(Collectors.toList());
        }
        return prompts;
    }
}
