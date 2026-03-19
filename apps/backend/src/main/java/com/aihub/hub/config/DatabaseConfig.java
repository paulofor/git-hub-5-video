package com.aihub.hub.config;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.FlywayException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.flyway.FlywayMigrationStrategy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

@Configuration
@ConditionalOnClass(Flyway.class)
@ConditionalOnBean(Flyway.class)
public class DatabaseConfig {

    private static final Logger log = LoggerFactory.getLogger(DatabaseConfig.class);

    @Bean
    public FlywayMigrationStrategy retryingFlywayMigrationStrategy() {
        return flyway -> {
            int attempt = 0;
            Duration delay = Duration.ofSeconds(5);

            while (true) {
                attempt++;
                try {
                    flyway.migrate();
                    if (attempt > 1) {
                        log.info(
                            "Conexão com o banco de dados restabelecida. Migrações aplicadas após {} tentativas.",
                            attempt
                        );
                    }
                    return;
                } catch (FlywayException ex) {
                    log.warn(
                        "Não foi possível aplicar as migrações do banco de dados (tentativa {}). Nova tentativa em {} segundos.",
                        attempt,
                        delay.toSeconds(),
                        ex
                    );
                }

                try {
                    Thread.sleep(delay.toMillis());
                } catch (InterruptedException interruptedException) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException(
                        "Thread interrompida enquanto aguardava nova tentativa de migração do banco de dados.",
                        interruptedException
                    );
                }

                long nextDelaySeconds = Math.min(delay.getSeconds() * 2, 60);
                delay = Duration.ofSeconds(nextDelaySeconds);
            }
        };
    }
}
