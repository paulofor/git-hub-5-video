package com.aihub.hub.domain;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter(autoApply = true)
public class JsonNodeConverter implements AttributeConverter<TemplateMap, String> {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Override
    public String convertToDatabaseColumn(TemplateMap attribute) {
        if (attribute == null) {
            return "{}";
        }
        try {
            return OBJECT_MAPPER.writeValueAsString(attribute.toMap());
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Unable to serialize template map", e);
        }
    }

    @Override
    public TemplateMap convertToEntityAttribute(String dbData) {
        if (dbData == null || dbData.isBlank()) {
            return new TemplateMap();
        }
        return TemplateMap.fromJson(dbData, OBJECT_MAPPER);
    }
}
