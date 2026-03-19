package com.aihub.hub.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import io.swagger.v3.oas.models.servers.Server;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class SwaggerConfig {

    @Bean
    public OpenAPI hubOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("AI Hub API")
                        .description("Documentação interativa para testar os endpoints do AI Hub.")
                        .version("v1")
                        .contact(new Contact()
                                .name("Equipe AI Hub")
                                .url("https://example.com")
                                .email("contato@example.com"))
                        .license(new License()
                                .name("Apache 2.0")
                                .url("https://www.apache.org/licenses/LICENSE-2.0")))
                .addServersItem(new Server().url("/").description("Servidor padrão"));
    }
}
