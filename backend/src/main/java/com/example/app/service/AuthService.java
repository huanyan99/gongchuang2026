package com.example.app.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.example.app.common.BizException;
import com.example.app.common.ErrorCode;
import com.example.app.dto.LoginRequest;
import com.example.app.entity.User;
import com.example.app.mapper.UserMapper;
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

    @Value("${wechat.appid}")
    private String appid;
    @Value("${wechat.secret}")
    private String secret;

    /** code 换 openid 并登录（不存在则建档），签发可校验的登录 token */
    @Transactional
    public User login(LoginRequest req) {
        Map<String, Object> resp = callWxJscode2session(req.getCode());
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
        String openid = String.valueOf(resp.get("openid"));

        User user = userMapper.selectOne(
                new LambdaQueryWrapper<User>().eq(User::getOpenid, openid));
        if (user == null) {
            user = new User();
            user.setOpenid(openid);
            user.setNickname(req.getNickname());
            user.setAvatarUrl(req.getAvatarUrl());
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
        issueToken(user);
        return user;
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

    @SuppressWarnings("unchecked")
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
            return wxRestClient.get()
                    .uri(url)
                    .retrieve()
                    .body(Map.class);
        } catch (Exception e) {
            log.warn("微信 jscode2session 调用失败: {}", e.getMessage());
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
}
