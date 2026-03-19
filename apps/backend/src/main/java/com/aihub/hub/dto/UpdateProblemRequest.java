package com.aihub.hub.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.List;

public record UpdateProblemRequest(
    @NotBlank(message = "Informe o título do problema")
    @Size(max = 200, message = "O título pode ter no máximo 200 caracteres")
    String title,
    @NotBlank(message = "Descreva o problema")
    @Size(max = 10000, message = "A descrição pode ter no máximo 10000 caracteres")
    String description,
    @NotNull(message = "Informe a data de inclusão")
    LocalDate includedAt,
    @Positive(message = "Informe um ambiente válido")
    Long environmentId,
    @Positive(message = "Informe um projeto válido")
    Long projectId,
    List<@Valid ProblemUpdatePayload> dailyUpdates,
    @Size(max = 5000, message = "A descrição de finalização pode ter no máximo 5000 caracteres")
    String finalizationDescription,
    LocalDate finalizedAt
) {
}
