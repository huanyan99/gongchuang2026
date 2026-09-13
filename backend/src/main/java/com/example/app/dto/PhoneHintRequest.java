package com.example.app.dto;

import jakarta.validation.constraints.Size;
import lombok.Data;

/** 查询手机号姓名掩码，以及已登录用户补全姓名核验 */
@Data
public class PhoneHintRequest {
    @Size(max = 20)
    private String phone;

    @Size(max = 32)
    private String name;
}
