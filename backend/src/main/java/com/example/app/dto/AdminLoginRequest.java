package com.example.app.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class AdminLoginRequest {
    @NotBlank
    @Size(max = 64)
    private String username;

    @NotBlank
    @Size(max = 128)
    private String password;
}
