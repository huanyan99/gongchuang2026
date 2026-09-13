package com.example.app.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.example.app.common.BizException;
import com.example.app.common.ErrorCode;
import com.example.app.dto.LoginRequest;
import com.example.app.dto.ProfileRequest;
import com.example.app.entity.ApplicationGuest;
import com.example.app.entity.User;
import com.example.app.mapper.ApplicationGuestMapper;
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

    /** 网页版手机号登录身份的 openid 前缀，与小程序/公众号 openid 区分 */
    public static final String WEB_OPENID_PREFIX = "web:";

    private final UserMapper userMapper;
    private final ApplicationGuestMapper applicationGuestMapper;
    private final RestClient wxRestClient;
    private final ObjectMapper objectMapper;

    @Value("${wechat.appid}")
    private String appid;
    @Value("${wechat.secret}")
    private String secret;
    @Value("${wechat.mock-login:false}")
    private boolean mockLogin;
    @Value("${wechat.official-account.appid:}")
    private String oauthAppid;
    @Value("${wechat.official-account.secret:}")
    private String oauthSecret;

    /** 小程序登录：前端传 wx.login 的 code，后端换取 openid 并返回 token */
    @Transactional
    public User login(LoginRequest req) {
        String openid = mockLogin ? "dev-user" : resolveOpenid(req.getCode());
        return loginByOpenid(openid, req);
    }

    /** 公众号网页授权登录（网页版）：前端传 OAuth2 的 code，后端换取 openid 并返回 token */
    @Transactional
    public User webLogin(LoginRequest req) {
        String openid = mockLogin ? "dev-user" : resolveOauthOpenid(req.getCode());
        return loginByOpenid(openid, req);
    }

    /** 公众号消息登录（网页版）：回调里拿到 openid 后直接建档发 token */
    @Transactional
    public User loginByOpenid(String openid) {
        return loginByOpenid(openid, null);
    }

    /**
     * 网页版手机号+姓名登录（无验证码）：
     * 手机号即身份（openid = web:手机号），姓名为本次登录凭据并回填档案；
     * 若与参会登记的同行人手机号+姓名匹配，自动带出性别，免再填贵宾信息。
     */
    @Transactional
    public User phoneLogin(String phone, String name) {
        String normalizedPhone = phone.trim();
        String trimmedName = name == null ? "" : name.trim();
        if (normalizedPhone.isEmpty() || trimmedName.isEmpty()) {
            throw new BizException(ErrorCode.BAD_REQUEST, "手机号和姓名不能为空");
        }
        String openid = WEB_OPENID_PREFIX + normalizedPhone;
        User user = userMapper.selectOne(new LambdaQueryWrapper<User>().eq(User::getOpenid, openid));
        if (user == null) {
            user = new User();
            user.setOpenid(openid);
            try {
                userMapper.insert(user);
            } catch (DuplicateKeyException e) {
                user = userMapper.selectOne(new LambdaQueryWrapper<User>().eq(User::getOpenid, openid));
                if (user == null) throw new BizException(ErrorCode.INTERNAL_ERROR);
            }
        }
        user.setPhone(normalizedPhone);
        if (user.getName() == null || user.getName().isBlank()) {
            user.setName(trimmedName);
        }
        if (user.getGender() == null || user.getGender().isBlank()) {
            ApplicationGuest guest = applicationGuestMapper.selectOne(
                    new LambdaQueryWrapper<ApplicationGuest>()
                            .eq(ApplicationGuest::getPhone, normalizedPhone)
                            .eq(ApplicationGuest::getName, trimmedName)
                            .orderByAsc(ApplicationGuest::getId)
                            .last("LIMIT 1"));
            if (guest != null) {
                user.setGender(guest.getGender());
                if (user.getName() == null || user.getName().isBlank()) {
                    user.setName(guest.getName());
                }
            }
        }
        issueToken(user);
        return user;
    }

    /** 按 openid 查找或创建账号，并签发可校验的登录 token */
    private User loginByOpenid(String openid, LoginRequest req) {
        User user = userMapper.selectOne(
                new LambdaQueryWrapper<User>().eq(User::getOpenid, openid));
        if (user == null) {
            user = new User();
            user.setOpenid(openid);
            if (req != null) {
                user.setNickname(req.getNickname());
                user.setAvatarUrl(req.getAvatarUrl());
            }
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

    private String resolveOauthOpenid(String code) {
        Map<String, Object> resp = callWxSnsAccessToken(code);
        if (resp == null) {
            throw new BizException(ErrorCode.WECHAT_API_ERROR);
        }
        Object errcode = resp.get("errcode");
        if (errcode != null && !"0".equals(String.valueOf(errcode))) {
            // 40029 code 无效/已使用、42023 redirect_uri 与网页授权域名不一致等，只记录错误码
            log.warn("公众号网页授权换 openid 失败: errcode={} errmsg={}", errcode, resp.get("errmsg"));
            throw new BizException(ErrorCode.WECHAT_API_ERROR);
        }
        if (resp.get("openid") == null) {
            throw new BizException(ErrorCode.WECHAT_API_ERROR);
        }
        return String.valueOf(resp.get("openid"));
    }

    private Map<String, Object> callWxSnsAccessToken(String code) {
        String url = UriComponentsBuilder
                .fromUriString("https://api.weixin.qq.com/sns/oauth2/access_token")
                .queryParam("appid", oauthAppid)
                .queryParam("secret", oauthSecret)
                .queryParam("code", code)
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
            // 异常消息可能包含带 AppSecret、code 的 URL，只记录异常类型。
            log.warn("公众号网页授权调用或解析失败: {}", e.getClass().getSimpleName());
            throw new BizException(ErrorCode.WECHAT_API_ERROR);
        }
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
