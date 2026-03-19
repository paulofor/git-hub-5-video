package com.aihub.hub.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateEnvironmentRequest(
    @NotBlank(message = "Informe o nome do ambiente")
    @Size(max = 150, message = "O nome pode ter no máximo 150 caracteres")
    String name,
    @Size(max = 255, message = "A descrição pode ter no máximo 255 caracteres")
    String description,
    @Size(max = 255, message = "O host pode ter no máximo 255 caracteres")
    String dbHost,
    @Min(value = 1, message = "A porta deve ser maior ou igual a 1")
    @Max(value = 65535, message = "A porta deve ser menor ou igual a 65535")
    Integer dbPort,
    @Size(max = 128, message = "O nome do database pode ter no máximo 128 caracteres")
    String dbName,
    @Size(max = 128, message = "O usuário pode ter no máximo 128 caracteres")
    String dbUser,
    @Size(max = 255, message = "A senha pode ter no máximo 255 caracteres")
    String dbPassword
) {
}
