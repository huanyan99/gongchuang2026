package com.example.app.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class ProfileRequest {
    @NotBlank @Size(max = 64)
    private String name;

    @NotBlank @Pattern(regexp = "男|女")
    private String gender;
}
