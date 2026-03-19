package com.aihub.hub.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateEnvironmentContainerRequest(
    @NotBlank(message = "Informe o nome do container")
    @Size(max = 191, message = "O nome pode ter no máximo 191 caracteres")
    String name,

    @NotBlank(message = "Informe o IP ou hostname do container")
    @Size(max = 191, message = "O IP/hostname pode ter no máximo 191 caracteres")
    String ipAddress,

    @NotNull(message = "Informe a porta do container")
    @Min(value = 1, message = "A porta deve ser maior ou igual a 1")
    @Max(value = 65535, message = "A porta deve ser menor ou igual a 65535")
    Integer port
) {
}
