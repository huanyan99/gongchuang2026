package com.example.app.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class GuestRequest {
    @NotBlank @Size(max = 64) private String name;
    @Size(max = 128) private String company;
    @NotBlank @Pattern(regexp = "男|女") private String gender;
    @NotBlank @Pattern(regexp = "^1\\d{10}$") private String phone;
    @Size(max = 64) private String position;
    @NotBlank @Pattern(regexp = "无需住宿|需要住宿") private String accommodation;
    @NotBlank private String roomType;
    @NotBlank @Pattern(regexp = "^\\d{4}-\\d{2}-\\d{2}$") private String checkinDate;
}
