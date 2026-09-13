package com.example.app.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/** 网页版手机号+姓名登录参数 */
@Data
public class PhoneLoginRequest {
    @NotBlank
    @Size(max = 20)
    private String phone;

    @NotBlank
    @Size(max = 32)
    private String name;
}
