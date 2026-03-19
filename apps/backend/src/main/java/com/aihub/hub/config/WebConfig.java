package com.aihub.hub.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private static final String[] DEFAULT_METHODS = {
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS"
    };

    private final List<String> allowedOrigins;
    private final boolean allowCredentials;

    public WebConfig(
        @Value("${hub.cors.allowed-origins:}") String allowedOrigins,
        @Value("${hub.cors.allow-credentials:false}") boolean allowCredentials
    ) {
        this.allowedOrigins = Arrays.stream(allowedOrigins.split(","))
            .map(String::trim)
            .filter(value -> !value.isEmpty())
            .collect(Collectors.toList());
        this.allowCredentials = allowCredentials;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        CorsRegistration registration = registry.addMapping("/api/**")
            .allowedMethods(DEFAULT_METHODS)
            .allowedHeaders("*")
            .exposedHeaders("*")
            .maxAge(3600);

        boolean allowAllOrigins = allowedOrigins.isEmpty() || allowedOrigins.contains("*");

        if (allowAllOrigins) {
            registration.allowedOriginPatterns("*");
            if (allowCredentials) {
                registration.allowCredentials(true);
            }
        } else {
            registration.allowedOrigins(allowedOrigins.toArray(new String[0]));
            registration.allowCredentials(allowCredentials);
        }
    }
}
