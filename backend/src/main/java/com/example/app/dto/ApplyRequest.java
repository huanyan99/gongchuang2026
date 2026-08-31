package com.example.app.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/** 申报表单 */
@Data
public class ApplyRequest {
    @NotBlank(message = "邀请码不能为空")
    private String invitationCode;
    @NotBlank(message = "姓名不能为空")
    private String name;
    @NotBlank(message = "手机号不能为空")
    private String phone;
    private String company;
    private String position;
    private String reason;
}
