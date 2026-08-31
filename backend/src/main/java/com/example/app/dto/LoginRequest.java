package com.example.app.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/** 小程序登录参数：wx.login 拿到的临时 code */
@Data
public class LoginRequest {
    @NotBlank
    @Size(max = 128)
    private String code;
    /** 可选：用户昵称、头像等 */
    @Size(max = 64)
    private String nickname;
    @Size(max = 512)
    private String avatarUrl;
}
