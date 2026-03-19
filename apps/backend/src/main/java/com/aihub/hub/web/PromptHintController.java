package com.aihub.hub.web;

import com.aihub.hub.dto.CreatePromptHintRequest;
import com.aihub.hub.dto.PromptHintView;
import com.aihub.hub.dto.UpdatePromptHintRequest;
import com.aihub.hub.service.PromptHintService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/prompt-hints")
public class PromptHintController {

    private final PromptHintService promptHintService;

    public PromptHintController(PromptHintService promptHintService) {
        this.promptHintService = promptHintService;
    }

    @GetMapping
    public List<PromptHintView> list(@RequestParam(value = "environment", required = false) String environmentName) {
        if (StringUtils.hasText(environmentName)) {
            return promptHintService.listForEnvironment(environmentName);
        }
        return promptHintService.listAll();
    }

    @PostMapping
    public PromptHintView create(@Valid @RequestBody CreatePromptHintRequest request) {
        return promptHintService.create(request);
    }

    @PutMapping("/{id}")
    public PromptHintView update(@PathVariable Long id, @Valid @RequestBody UpdatePromptHintRequest request) {
        return promptHintService.update(id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        promptHintService.delete(id);
    }
}
