package com.aihub.hub.web;

import com.aihub.hub.domain.CodexModelPricing;
import com.aihub.hub.dto.CodexModelPricingRequest;
import com.aihub.hub.service.CodexModelPricingService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/codex/models")
public class CodexModelPricingController {

    private final CodexModelPricingService service;

    public CodexModelPricingController(CodexModelPricingService service) {
        this.service = service;
    }

    @GetMapping
    public List<CodexModelPricing> list() {
        return service.findAll();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CodexModelPricing create(@Valid @RequestBody CodexModelPricingRequest request) {
        return service.create(request);
    }

    @PutMapping("/{id}")
    public CodexModelPricing update(@PathVariable Long id, @Valid @RequestBody CodexModelPricingRequest request) {
        return service.update(id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }
}
