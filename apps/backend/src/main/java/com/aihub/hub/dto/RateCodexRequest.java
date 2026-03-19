package com.aihub.hub.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public class RateCodexRequest {

    @NotNull
    @Min(1)
    @Max(5)
    private Integer rating;

    public RateCodexRequest() {
    }

    public Integer getRating() {
        return rating;
    }

    public void setRating(Integer rating) {
        this.rating = rating;
    }
}
