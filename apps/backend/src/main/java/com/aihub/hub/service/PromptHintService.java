package com.aihub.hub.service;

import com.aihub.hub.domain.EnvironmentRecord;
import com.aihub.hub.domain.PromptHintRecord;
import com.aihub.hub.dto.CreatePromptHintRequest;
import com.aihub.hub.dto.PromptHintView;
import com.aihub.hub.dto.UpdatePromptHintRequest;
import com.aihub.hub.repository.EnvironmentRepository;
import com.aihub.hub.repository.PromptHintRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
public class PromptHintService {

    private final PromptHintRepository promptHintRepository;
    private final EnvironmentRepository environmentRepository;
    private final Comparator<PromptHintRecord> scopeComparator = (first, second) -> {
        boolean firstIsGlobal = first.getEnvironment() == null;
        boolean secondIsGlobal = second.getEnvironment() == null;

        if (firstIsGlobal && secondIsGlobal) {
            return first.getLabel().compareToIgnoreCase(second.getLabel());
        }
        if (firstIsGlobal) {
            return -1;
        }
        if (secondIsGlobal) {
            return 1;
        }

        int envCompare = first.getEnvironment().getName().compareToIgnoreCase(second.getEnvironment().getName());
        if (envCompare != 0) {
            return envCompare;
        }
        return first.getLabel().compareToIgnoreCase(second.getLabel());
    };

    public PromptHintService(PromptHintRepository promptHintRepository,
                             EnvironmentRepository environmentRepository) {
        this.promptHintRepository = promptHintRepository;
        this.environmentRepository = environmentRepository;
    }

    @Transactional(readOnly = true)
    public List<PromptHintView> listAll() {
        List<PromptHintRecord> records = promptHintRepository.findAll();
        records.sort(scopeComparator);
        return records.stream().map(this::toView).toList();
    }

    @Transactional(readOnly = true)
    public List<PromptHintView> listForEnvironment(String environmentName) {
        List<PromptHintRecord> result = new ArrayList<>(promptHintRepository.findAllByEnvironmentIsNullOrderByLabelAsc());
        if (StringUtils.hasText(environmentName)) {
            environmentRepository.findByNameIgnoreCase(environmentName.trim())
                .ifPresent(environment -> result.addAll(promptHintRepository.findAllByEnvironmentOrderByLabelAsc(environment)));
        }
        result.sort(scopeComparator);
        return result.stream().map(this::toView).toList();
    }

    @Transactional
    public PromptHintView create(CreatePromptHintRequest request) {
        PromptHintRecord record = new PromptHintRecord();
        record.setLabel(request.label().trim());
        record.setPhrase(request.phrase().trim());
        record.setEnvironment(resolveEnvironment(request.environmentId()));
        PromptHintRecord saved = promptHintRepository.save(record);
        return toView(saved);
    }

    @Transactional
    public PromptHintView update(Long id, UpdatePromptHintRequest request) {
        PromptHintRecord record = promptHintRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Item opcional não encontrado"));
        record.setLabel(request.label().trim());
        record.setPhrase(request.phrase().trim());
        record.setEnvironment(resolveEnvironment(request.environmentId()));
        PromptHintRecord saved = promptHintRepository.save(record);
        return toView(saved);
    }

    @Transactional
    public void delete(Long id) {
        if (!promptHintRepository.existsById(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Item opcional não encontrado");
        }
        promptHintRepository.deleteById(id);
    }

    private EnvironmentRecord resolveEnvironment(Long environmentId) {
        if (environmentId == null) {
            return null;
        }
        return environmentRepository.findById(environmentId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ambiente não encontrado"));
    }

    private PromptHintView toView(PromptHintRecord record) {
        EnvironmentRecord environment = record.getEnvironment();
        Long environmentId = environment != null ? environment.getId() : null;
        String environmentName = environment != null ? environment.getName() : null;
        return new PromptHintView(
            record.getId(),
            record.getLabel(),
            record.getPhrase(),
            environmentId,
            environmentName,
            record.getCreatedAt(),
            record.getUpdatedAt()
        );
    }
}
