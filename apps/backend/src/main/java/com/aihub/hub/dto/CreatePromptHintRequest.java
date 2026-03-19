package com.aihub.hub.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record CreatePromptHintRequest(
    @NotBlank(message = "Informe um nome para o item opcional")
    @Size(max = 150, message = "O nome pode ter no máximo 150 caracteres")
    String label,
    @NotBlank(message = "Informe a frase que será adicionada ao prompt")
    @Size(max = 2000, message = "A frase pode ter no máximo 2000 caracteres")
    String phrase,
    @Positive(message = "Informe um ambiente válido")
    Long environmentId
) {
}
