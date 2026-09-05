package com.example.app.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.example.app.common.BizException;
import com.example.app.common.ErrorCode;
import com.example.app.dto.LoginRequest;
import com.example.app.dto.ProfileRequest;
import com.example.app.entity.User;
import com.example.app.mapper.UserMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private static final int TOKEN_DAYS = 30;

    private final UserMapper userMapper;
    private final RestClient wxRestClient;
    private final ObjectMapper objectMapper;

    @Value("${wechat.appid}")
    private String appid;
    @Value("${wechat.secret}")
    private String secret;
    @Value("${wechat.mock-login:false}")
    private boolean mockLogin;

    /** code 换 openid 并登录（不存在则建档），签发可校验的登录 token */
    @Transactional
    public User login(LoginRequest req) {
        String openid = mockLogin ? "dev-user" : resolveOpenid(req.getCode());

        User user = userMapper.selectOne(
                new LambdaQueryWrapper<User>().eq(User::getOpenid, openid));
        if (user == null) {
            user = new User();
            user.setOpenid(openid);
            user.setNickname(req.getNickname());
            user.setAvatarUrl(req.getAvatarUrl());
            if (mockLogin) {
                user.setCanInvite(true);
                user.setCanReview(true);
            }
            try {
                userMapper.insert(user);
            } catch (DuplicateKeyException e) {
                user = userMapper.selectOne(
                        new LambdaQueryWrapper<User>().eq(User::getOpenid, openid));
                if (user == null) {
                    throw new BizException(ErrorCode.INTERNAL_ERROR);
                }
            }
        }
        if (mockLogin && (!Boolean.TRUE.equals(user.getCanInvite()) || !Boolean.TRUE.equals(user.getCanReview()))) {
            user.setCanInvite(true);
            user.setCanReview(true);
        }
        issueToken(user);
        return user;
    }

    private String resolveOpenid(String code) {
        Map<String, Object> resp = callWxJscode2session(code);
        if (resp == null) {
            throw new BizException(ErrorCode.WECHAT_API_ERROR);
        }
        Object errcode = resp.get("errcode");
        if (errcode != null && !"0".equals(String.valueOf(errcode))) {
            log.warn("微信 jscode2session 业务失败: errcode={} errmsg={}", errcode, resp.get("errmsg"));
            throw new BizException(ErrorCode.WECHAT_API_ERROR);
        }
        if (resp.get("openid") == null) {
            throw new BizException(ErrorCode.WECHAT_API_ERROR);
        }
        return String.valueOf(resp.get("openid"));
    }

    public User findValidByToken(String token) {
        if (token == null || token.isBlank()) {
            return null;
        }
        User user = userMapper.selectOne(
                new LambdaQueryWrapper<User>().eq(User::getToken, token.trim()));
        if (user == null || user.getTokenExpire() == null || user.getTokenExpire().isBefore(LocalDateTime.now())) {
            return null;
        }
        return user;
    }

    private Map<String, Object> callWxJscode2session(String code) {
        String url = UriComponentsBuilder
                .fromUriString("https://api.weixin.qq.com/sns/jscode2session")
                .queryParam("appid", appid)
                .queryParam("secret", secret)
                .queryParam("js_code", code)
                .queryParam("grant_type", "authorization_code")
                .build()
                .toUriString();
        try {
            String response = wxRestClient.get()
                    .uri(url)
                    .retrieve()
                    .body(String.class);
            return objectMapper.readValue(response, new TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            // 异常消息可能包含带 AppSecret、js_code 的 URL，只记录异常类型。
            log.warn("微信 jscode2session 调用或解析失败: {}", e.getClass().getSimpleName());
            throw new BizException(ErrorCode.WECHAT_API_ERROR);
        }
    }

    public String issueToken(User user) {
        String token = UUID.randomUUID().toString().replace("-", "");
        user.setToken(token);
        user.setTokenExpire(LocalDateTime.now().plusDays(TOKEN_DAYS));
        userMapper.updateById(user);
        return token;
    }

    public User updateProfile(User user, ProfileRequest req) {
        String name = req.getName().trim();
        if (name.isEmpty()) throw new BizException(ErrorCode.BAD_REQUEST, "姓名不能为空");
        user.setName(name);
        user.setGender(req.getGender());
        if (userMapper.updateById(user) != 1) throw new BizException(ErrorCode.UNAUTHORIZED);
        return user;
    }
}
