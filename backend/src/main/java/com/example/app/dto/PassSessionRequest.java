package com.example.app.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/** 现场通道换会话参数 */
@Data
public class PassSessionRequest {

    @NotBlank
    @Size(max = 64)
    private String pass;

    @NotBlank
    @Size(max = 32)
    private String name;

    /** 同名多人时用手机号后四位区分 */
    @Size(max = 4)
    private String phoneTail;
}
