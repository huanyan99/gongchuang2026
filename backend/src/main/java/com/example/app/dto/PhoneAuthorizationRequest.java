package com.example.app.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class PhoneAuthorizationRequest {
    @NotBlank
    @Size(max = 512)
    private String code;
}
