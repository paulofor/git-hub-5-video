package com.aihub.hub.service;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class FileReferenceExtractor {

    private static final Pattern CODE_SPAN_PATTERN = Pattern.compile("`([^`]+)`");
    private static final Pattern GENERIC_PATH_PATTERN = Pattern.compile("([\\w./-]+\\.[A-Za-z0-9]{1,10})");

    public List<String> extract(String text) {
        if (text == null || text.isBlank()) {
            return List.of();
        }

        Set<String> references = new LinkedHashSet<>();
        collectMatches(text, CODE_SPAN_PATTERN, references);
        collectMatches(text, GENERIC_PATH_PATTERN, references);
        if (references.isEmpty()) {
            return List.of();
        }
        return new ArrayList<>(references);
    }

    private void collectMatches(String text, Pattern pattern, Set<String> references) {
        Matcher matcher = pattern.matcher(text);
        while (matcher.find()) {
            String candidate = matcher.group(1);
            String normalized = normalize(candidate);
            if (looksLikePath(normalized)) {
                references.add(normalized);
            }
        }
    }

    private String normalize(String candidate) {
        if (candidate == null) {
            return null;
        }
        String trimmed = candidate.trim();
        if (trimmed.endsWith(".") || trimmed.endsWith(",")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1).trim();
        }
        return trimmed;
    }

    private boolean looksLikePath(String value) {
        if (value == null || value.isBlank()) {
            return false;
        }
        boolean hasSlash = value.contains("/");
        boolean hasExtension = value.contains(".");
        return hasSlash && hasExtension && !value.contains(" ");
    }
}
