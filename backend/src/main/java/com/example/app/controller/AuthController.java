package com.example.app.controller;

import com.example.app.common.Result;
import com.example.app.dto.LoginRequest;
import com.example.app.entity.User;
import com.example.app.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    /** 小程序登录：前端传 wx.login 的 code，后端换取 openid 并返回 token */
    @PostMapping("/login")
    public Result<Map<String, Object>> login(@Valid @RequestBody LoginRequest req) {
        User user = authService.login(req);
        return Result.ok(Map.of("token", user.getToken(), "user", user));
    }
}
