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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    /** 登录态保留 60 天；不做定期清理，只有用户主动退出登录才作废 */
    private static final int TOKEN_DAYS = 60;

    /** 网页版手机号登录身份的 openid 前缀，与小程序/公众号 openid 区分 */
    public static final String WEB_OPENID_PREFIX = "web:";

    private final UserMapper userMapper;
    private final ApplicationGuestMapper applicationGuestMapper;
    private final RestClient wxRestClient;
    private final ObjectMapper objectMapper;
    /** 设备开关；单元测试直接 new AuthService 时允许为空，此时按邀请人限制处理 */
    private final SettingService settingService;

    /** 审计失败不能阻断用户登录；非 final 保持现有单元测试构造方式兼容。 */
    @Autowired(required = false)
    private LoginAuditService loginAuditService;

    @Autowired(required = false)
    private LuckyCodeGeneratorService luckyCodeGeneratorService;

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
        return login(req, null);
    }

    /** 小程序登录，并按设备标识执行「一个账号一台设备」限制 */
    @Transactional
    public User login(LoginRequest req, String deviceId) {
        String openid = mockLogin ? "dev-user" : resolveOpenid(req.getCode());
        return loginByOpenid(openid, req, deviceId, "MINIPROGRAM");
    }

    /** 公众号网页授权登录（网页版）：前端传 OAuth2 的 code，后端换取 openid 并返回 token */
    @Transactional
    public User webLogin(LoginRequest req) {
        return webLogin(req, null);
    }

    /** 公众号网页授权登录，并按设备标识执行限制 */
    @Transactional
    public User webLogin(LoginRequest req, String deviceId) {
        String openid = mockLogin ? "dev-user" : resolveOauthOpenid(req.getCode());
        return loginByOpenid(openid, req, deviceId, "OFFICIAL_ACCOUNT");
    }

    /** 公众号消息登录（网页版）：回调里拿到 openid 后直接建档发 token */
    @Transactional
    public User loginByOpenid(String openid) {
        return loginByOpenid(openid, null, null, "WECHAT_MESSAGE");
    }

    /**
     * 网页版手机号+姓名登录（无验证码）：
     * 手机号即身份（openid = web:手机号），姓名为本次登录凭据并回填档案；
     * 若与参会登记的同行人手机号+姓名匹配，自动带出性别，免再填贵宾信息。
     */
    @Transactional
    public User phoneLogin(String phone, String name) {
        return phoneLogin(phone, name, null);
    }

    /** 网页版手机号+姓名登录，并按设备标识执行限制 */
    @Transactional
    public User phoneLogin(String phone, String name, String deviceId) {
        String normalizedPhone = phone.trim();
        String trimmedName = name == null ? "" : name.trim();
        if (normalizedPhone.isEmpty() || trimmedName.isEmpty()) {
            throw new BizException(ErrorCode.BAD_REQUEST, "手机号和姓名不能为空");
        }
        // 该手机号已在参会登记中出现过时，姓名必须与登记一致，作为身份核验
        List<ApplicationGuest> registered = guestsByPhone(normalizedPhone);
        ApplicationGuest matched = matchByName(registered, trimmedName);
        if (!registered.isEmpty() && matched == null) {
            throw new BizException(ErrorCode.BAD_REQUEST, "姓名与登记信息不一致");
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
        if (matched != null) {
            // 以登记信息为准回填档案，姓名核验通过后不再要求填写性别
            user.setName(matched.getName());
            if (matched.getGender() != null && !matched.getGender().isBlank()) {
                user.setGender(matched.getGender());
            }
        } else if (user.getName() == null || user.getName().isBlank()) {
            user.setName(trimmedName);
        }
        applyDeviceGuard(user, deviceId, "WEB_PHONE");
        issueToken(user);
        ensureLuckyCode(user);
        safeAudit(user, "WEB_PHONE", deviceId, "SUCCESS", "登录成功");
        return user;
    }

    /** 按 openid 查找或创建账号，并签发可校验的登录 token */
    private User loginByOpenid(String openid, LoginRequest req) {
        return loginByOpenid(openid, req, null, "MINIPROGRAM");
    }

    private User loginByOpenid(String openid, LoginRequest req, String deviceId, String loginType) {
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
        applyDeviceGuard(user, deviceId, loginType);
        issueToken(user);
        ensureLuckyCode(user);
        safeAudit(user, loginType, deviceId, "SUCCESS", "登录成功");
        return user;
    }

    /**
     * 一个账号一台设备：首次登录绑定设备识别码。
     * 邀请人与普通嘉宾各有一个后台开关，每次登录实时读库，后台改完即刻生效；
     * 未开启限制时绑定跟随最新设备。客户端未携带识别码时放行，避免旧客户端被挡在门外。
     */
    private void applyDeviceGuard(User user, String deviceId, String loginType) {
        String incoming = deviceId == null ? "" : deviceId.trim();
        if (incoming.isEmpty()) return;

        String bound = user.getDeviceId() == null ? "" : user.getDeviceId().trim();
        if (bound.equals(incoming)) return;

        boolean inviter = Boolean.TRUE.equals(user.getCanInvite()) || Boolean.TRUE.equals(user.getCanReview());
        boolean enforce = settingService == null
                ? inviter
                : settingService.isEnabled(inviter
                        ? SettingService.DEVICE_BINDING_INVITERS
                        : SettingService.DEVICE_BINDING_GUESTS, inviter);
        if (bound.isEmpty() || !enforce) {
            user.setDeviceId(incoming);
            return;
        }
        safeAudit(user, loginType, incoming, "DEVICE_CONFLICT", "账号已绑定其他设备");
        throw new BizException(ErrorCode.DEVICE_LIMITED);
    }

    private void safeAudit(User user, String loginType, String deviceId, String result, String reason) {
        if (loginAuditService == null) return;
        try {
            loginAuditService.recordLogin(user, loginType, deviceId, result, reason);
        } catch (Exception e) {
            log.warn("登录审计写入失败: type={} result={} error={}", loginType, result, e.getClass().getSimpleName());
        }
    }

    private void ensureLuckyCode(User user) {
        if (luckyCodeGeneratorService == null || user == null || user.getId() == null) return;
        try {
            luckyCodeGeneratorService.getOrCreate(user.getId());
        } catch (Exception e) {
            log.warn("注册抽奖码生成失败: userId={} error={}", user.getId(), e.getClass().getSimpleName());
        }
    }

    /** 已登录用户补全姓名：与本人手机号的登记信息比对，通过后回填姓名与性别 */
    @Transactional
    public User verifyProfileName(User user, String name) {
        String phone = user.getPhone() == null ? "" : user.getPhone().trim();
        if (phone.isEmpty()) {
            throw new BizException(ErrorCode.BAD_REQUEST, "请先完成手机号授权");
        }
        String trimmedName = name == null ? "" : name.trim();
        ApplicationGuest matched = matchByName(guestsByPhone(phone), trimmedName);
        if (matched == null) {
            throw new BizException(ErrorCode.BAD_REQUEST, "姓名与登记信息不一致");
        }
        user.setName(matched.getName());
        if (matched.getGender() != null && !matched.getGender().isBlank()) {
            user.setGender(matched.getGender());
        }
        userMapper.updateById(user);
        return user;
    }

    /** 手机号在参会登记中的姓名提示：只回掩码与待补字数，不回完整姓名 */
    public Map<String, Object> phoneHint(String phone) {
        String normalizedPhone = phone == null ? "" : phone.trim();
        ApplicationGuest guest = normalizedPhone.isEmpty() ? null : applicationGuestMapper.selectOne(
                new LambdaQueryWrapper<ApplicationGuest>()
                        .eq(ApplicationGuest::getPhone, normalizedPhone)
                        .orderByAsc(ApplicationGuest::getId)
                        .last("LIMIT 1"));
        String name = guest == null || guest.getName() == null ? "" : guest.getName().trim();
        String maskedName = maskName(name);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("known", !maskedName.isEmpty());
        body.put("maskedName", maskedName);
        body.put("missingCount", missingCount(name));
        return body;
    }

    /** 按手机号找到或创建网页身份，不签发 token（现场通道等场景复用） */
    @Transactional
    public User ensureWebUser(String phone, String name) {
        String normalizedPhone = phone == null ? "" : phone.trim();
        if (normalizedPhone.isEmpty()) throw new BizException(ErrorCode.BAD_REQUEST, "手机号不能为空");
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
        if (name != null && !name.isBlank()) user.setName(name.trim());
        userMapper.updateById(user);
        return user;
    }

    /** 该手机号在参会登记中的全部记录（含同行人） */
    public List<ApplicationGuest> guestsByPhone(String phone) {
        String normalized = phone == null ? "" : phone.trim();
        if (normalized.isEmpty()) return List.of();
        return applicationGuestMapper.selectList(new LambdaQueryWrapper<ApplicationGuest>()
                .eq(ApplicationGuest::getPhone, normalized)
                .orderByAsc(ApplicationGuest::getId));
    }

    private ApplicationGuest matchByName(List<ApplicationGuest> guests, String name) {
        return guests.stream()
                .filter((guest) -> name.equals(guest.getName() == null ? "" : guest.getName().trim()))
                .findFirst()
                .orElse(null);
    }

    /** 姓名掩码：隐藏第二个字（两字姓名即末字，三字及以上即中间字），与银行转账核验一致 */
    public static String maskName(String name) {
        String value = name == null ? "" : name.trim();
        if (value.length() < 2) return "";
        return value.charAt(0) + "*" + value.substring(2);
    }

    private static int missingCount(String name) {
        return maskName(name).isEmpty() ? 0 : 1;
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

    /** 主动退出登录：作废当前 token，其他设备/浏览器的历史 token 一并失效 */
    @Transactional
    public void logout(User user) {
        if (user == null || user.getId() == null) return;
        userMapper.update(null, new com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<User>()
                .eq(User::getId, user.getId())
                .set(User::getToken, null)
                .set(User::getTokenExpire, null));
    }

    public User findById(Long id) {
        return id == null ? null : userMapper.selectById(id);
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
