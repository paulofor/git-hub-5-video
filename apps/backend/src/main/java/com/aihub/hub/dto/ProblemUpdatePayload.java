package com.aihub.hub.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

public record ProblemUpdatePayload(
    @NotNull(message = "Informe a data do progresso do problema")
    LocalDate entryDate,
    @NotBlank(message = "Descreva o progresso do problema")
    @Size(max = 2000, message = "A descrição diária pode ter no máximo 2000 caracteres")
    String description
) {
}
