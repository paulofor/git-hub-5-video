package com.aihub.hub.domain;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

public class TemplateMap {
    private final Map<String, String> templates = new HashMap<>();

    @JsonAnySetter
    public void put(String key, String value) {
        templates.put(key, value);
    }

    @JsonAnyGetter
    public Map<String, String> getTemplates() {
        return Collections.unmodifiableMap(templates);
    }

    public Map<String, String> toMap() {
        return Collections.unmodifiableMap(templates);
    }

    public static TemplateMap fromJson(String json, ObjectMapper mapper) {
        try {
            TemplateMap map = new TemplateMap();
            Map<String, String> parsed = mapper.readValue(json, mapper.getTypeFactory().constructMapType(Map.class, String.class, String.class));
            parsed.forEach(map.templates::put);
            return map;
        } catch (IOException e) {
            throw new IllegalArgumentException("Invalid template map json", e);
        }
    }
}
