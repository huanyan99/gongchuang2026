package com.example.app.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class CheckinRequest {
    @NotBlank(message = "核验凭证不能为空")
    @Size(max = 256)
    private String token;
}
