package com.example.app.controller;

import com.example.app.common.Result;
import com.example.app.dto.LoginRequest;
import com.example.app.entity.User;
import com.example.app.service.AuthService;
import com.example.app.service.WechatPhoneService;
import com.example.app.dto.PhoneAuthorizationRequest;
import com.example.app.dto.ProfileRequest;
import com.example.app.config.UserContext;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final WechatPhoneService wechatPhoneService;

    @GetMapping("/me")
    public Result<User> me() {
        return Result.ok(UserContext.require());
    }

    @PostMapping("/phone")
    public Result<Map<String, String>> phone(@Valid @RequestBody PhoneAuthorizationRequest req) {
        return Result.ok(wechatPhoneService.authorize(UserContext.require(), req.getCode()));
    }

    @PutMapping("/profile")
    public Result<User> profile(@Valid @RequestBody ProfileRequest req) {
        return Result.ok(authService.updateProfile(UserContext.require(), req));
    }

    /** 小程序登录：前端传 wx.login 的 code，后端换取 openid 并返回 token */
    @PostMapping("/login")
    public Result<Map<String, Object>> login(@Valid @RequestBody LoginRequest req) {
        User user = authService.login(req);
        return Result.ok(Map.of("token", user.getToken(), "user", user));
    }
}
