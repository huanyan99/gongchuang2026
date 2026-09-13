package com.example.app.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class AdminPasswordRequest {
    @NotBlank
    @Size(max = 128)
    private String currentPassword;

    @NotBlank
    @Size(max = 128)
    private String newPassword;
}
