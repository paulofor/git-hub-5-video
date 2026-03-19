package com.aihub.hub.service;

import com.aihub.hub.domain.CodexModelPricing;
import com.aihub.hub.dto.CodexModelPricingRequest;
import com.aihub.hub.repository.CodexModelPricingRepository;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Optional;

@Service
public class CodexModelPricingService {

    private final CodexModelPricingRepository repository;

    public CodexModelPricingService(CodexModelPricingRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public List<CodexModelPricing> findAll() {
        return repository.findAll(Sort.by(Sort.Direction.ASC, "modelName"));
    }

    @Transactional(readOnly = true)
    public Optional<CodexModelPricing> findByModelName(String modelName) {
        if (!StringUtils.hasText(modelName)) {
            return Optional.empty();
        }
        return repository.findByModelNameIgnoreCase(modelName.trim());
    }

    @Transactional
    public CodexModelPricing create(CodexModelPricingRequest request) {
        CodexModelPricing entity = new CodexModelPricing();
        apply(entity, request);
        return repository.save(entity);
    }

    @Transactional
    public CodexModelPricing update(Long id, CodexModelPricingRequest request) {
        CodexModelPricing entity = repository.findById(id)
            .orElseThrow(() -> new EntityNotFoundException("Modelo de pricing não encontrado: " + id));
        apply(entity, request);
        return repository.save(entity);
    }

    @Transactional
    public void delete(Long id) {
        if (!repository.existsById(id)) {
            throw new EntityNotFoundException("Modelo de pricing não encontrado: " + id);
        }
        repository.deleteById(id);
    }

    private void apply(CodexModelPricing entity, CodexModelPricingRequest request) {
        entity.setModelName(request.getModelName().trim());
        entity.setDisplayName(StringUtils.hasText(request.getDisplayName()) ? request.getDisplayName().trim() : null);
        entity.setInputPricePerMillion(request.getInputPricePerMillion());
        entity.setCachedInputPricePerMillion(request.getCachedInputPricePerMillion());
        entity.setOutputPricePerMillion(request.getOutputPricePerMillion());
    }
}
