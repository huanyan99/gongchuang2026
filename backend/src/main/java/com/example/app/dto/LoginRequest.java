package com.example.app.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/** 小程序登录参数：wx.login 拿到的临时 code */
@Data
public class LoginRequest {
    @NotBlank
    private String code;
    /** 可选：用户昵称、头像等 */
    private String nickname;
    private String avatarUrl;
}
