package com.example.app.controller;

import com.example.app.common.Result;
import com.example.app.dto.LoginRequest;
import com.example.app.dto.PhoneHintRequest;
import com.example.app.dto.PhoneLoginRequest;
import com.example.app.dto.TicketLoginRequest;
import com.example.app.entity.User;
import com.example.app.service.AuthService;
import com.example.app.service.WechatLoginService;
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
    private final WechatLoginService wechatLoginService;

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

    /** 退出登录：作废当前登录态 */
    @PostMapping("/logout")
    public Result<Void> logout() {
        authService.logout(UserContext.require());
        return Result.ok();
    }

    /** 补全姓名核验：与本人手机号的登记信息比对，通过后回填档案 */
    @PostMapping("/profile/verify")
    public Result<User> verifyProfile(@Valid @RequestBody PhoneHintRequest req) {
        return Result.ok(authService.verifyProfileName(UserContext.require(), req.getName()));
    }

    /** 手机号在参会登记中的姓名掩码，用于登录时补全姓名核验身份 */
    @PostMapping("/phone-hint")
    public Result<Map<String, Object>> phoneHint(@Valid @RequestBody PhoneHintRequest req) {
        return Result.ok(authService.phoneHint(req.getPhone()));
    }

    /** 小程序登录：前端传 wx.login 的 code，后端换取 openid 并返回 token */
    @PostMapping("/login")
    public Result<Map<String, Object>> login(@Valid @RequestBody LoginRequest req,
                                             @RequestHeader(value = "X-Device-Id", required = false) String deviceId) {
        User user = authService.login(req, deviceId);
        return Result.ok(Map.of("token", user.getToken(), "user", user));
    }

    /** 公众号网页授权登录（网页版）：前端传 OAuth2 的 code，后端换取 openid 并返回 token */
    @PostMapping("/web-login")
    public Result<Map<String, Object>> webLogin(@Valid @RequestBody LoginRequest req,
                                                @RequestHeader(value = "X-Device-Id", required = false) String deviceId) {
        User user = authService.webLogin(req, deviceId);
        return Result.ok(Map.of("token", user.getToken(), "user", user));
    }

    /** 网页版手机号+姓名登录（无验证码）：按手机号建立/认领身份并返回 token */
    @PostMapping("/phone-login")
    public Result<Map<String, Object>> phoneLogin(@Valid @RequestBody PhoneLoginRequest req,
                                                  @RequestHeader(value = "X-Device-Id", required = false) String deviceId) {
        User user = authService.phoneLogin(req.getPhone(), req.getName(), deviceId);
        return Result.ok(Map.of("token", user.getToken(), "user", user));
    }

    /** 公众号消息登录（网页版）：公众号回复的数字登录码换正式会话 */
    @PostMapping("/code-login")
    public Result<Map<String, Object>> codeLogin(@Valid @RequestBody LoginRequest req) {
        User user = wechatLoginService.loginByCode(req.getCode());
        return Result.ok(Map.of("token", user.getToken(), "user", user));
    }

    /** 公众号消息登录（网页版）：一键登录链接里的 ticket 换正式会话 */
    @PostMapping("/ticket-login")
    public Result<Map<String, Object>> ticketLogin(@Valid @RequestBody TicketLoginRequest req) {
        User user = wechatLoginService.loginByTicket(req.getTicket());
        return Result.ok(Map.of("token", user.getToken(), "user", user));
    }
}
