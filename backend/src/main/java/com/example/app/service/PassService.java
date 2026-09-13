package com.example.app.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.example.app.common.ApplyStatus;
import com.example.app.common.BizException;
import com.example.app.common.ErrorCode;
import com.example.app.entity.AccessPass;
import com.example.app.entity.Application;
import com.example.app.entity.ApplicationGuest;
import com.example.app.entity.PassSession;
import com.example.app.entity.User;
import com.example.app.mapper.AccessPassMapper;
import com.example.app.mapper.ApplicationGuestMapper;
import com.example.app.mapper.ApplicationMapper;
import com.example.app.mapper.PassSessionMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 桌位图现场通道：会场二维码带一个不可猜的 pass 参数，长期有效、提前不公布。
 * 扫码的嘉宾只需核对姓名即可查看自己的桌位，不需要手机号登录。
 * 通道会话只在桌位接口上生效（见 AuthInterceptor），抽奖码仍需手机号+姓名正常登录。
 */
@Service
@RequiredArgsConstructor
public class PassService {

    private static final int SESSION_HOURS = 12;

    private final AccessPassMapper accessPassMapper;
    private final PassSessionMapper passSessionMapper;
    private final ApplicationGuestMapper applicationGuestMapper;
    private final ApplicationMapper applicationMapper;
    private final InvitationService invitationService;
    private final AuthService authService;
    private final QrCodeService qrCodeService;
    private final SecureRandom random = new SecureRandom();

    @Value("${app.web-base-url:}")
    private String webBaseUrl;

    /* ---------- 管理端 ---------- */

    @Transactional
    public Map<String, Object> create(String eventCity, String note) {
        byte[] raw = new byte[18];
        random.nextBytes(raw);

        AccessPass pass = new AccessPass();
        pass.setToken(Base64.getUrlEncoder().withoutPadding().encodeToString(raw));
        pass.setEventCity(eventCity == null || eventCity.isBlank() ? null : eventCity.trim());
        pass.setNote(note == null || note.isBlank() ? null : note.trim());
        pass.setEnabled(true);
        pass.setExpiresAt(null);
        pass.setCreatedAt(LocalDateTime.now());
        accessPassMapper.insert(pass);
        return describe(pass, true);
    }

    public List<Map<String, Object>> list() {
        return accessPassMapper.selectList(new LambdaQueryWrapper<AccessPass>().orderByDesc(AccessPass::getId))
                .stream().map((pass) -> describe(pass, false)).toList();
    }

    @Transactional
    public Map<String, Object> disable(Long id) {
        AccessPass pass = accessPassMapper.selectById(id);
        if (pass == null) throw new BizException(ErrorCode.NOT_FOUND, "通道不存在");
        pass.setEnabled(false);
        accessPassMapper.updateById(pass);
        passSessionMapper.delete(new LambdaQueryWrapper<PassSession>().eq(PassSession::getPassId, id));
        return describe(pass, false);
    }

    /* ---------- 嘉宾端 ---------- */

    /**
     * 扫码后按姓名换通道会话。
     * 同名多人时返回 needPhoneTail，让嘉宾补手机号后四位再区分。
     */
    @Transactional
    public Map<String, Object> openSession(String passToken, String name, String phoneTail) {
        AccessPass pass = requirePass(passToken);
        String trimmedName = name == null ? "" : name.trim();
        if (trimmedName.isEmpty()) throw new BizException(ErrorCode.BAD_REQUEST, "请输入姓名");

        List<ApplicationGuest> candidates = new ArrayList<>();
        for (ApplicationGuest guest : applicationGuestMapper.selectList(new LambdaQueryWrapper<ApplicationGuest>()
                .eq(ApplicationGuest::getName, trimmedName)
                .orderByAsc(ApplicationGuest::getId))) {
            Application application = applicationMapper.selectById(guest.getApplicationId());
            if (application == null || !ApplyStatus.APPROVED.name().equals(application.getStatus())) continue;
            if (pass.getEventCity() != null && !pass.getEventCity().equals(cityOf(application))) continue;
            candidates.add(guest);
        }
        if (candidates.isEmpty()) {
            throw new BizException(ErrorCode.NOT_FOUND, "未找到该姓名的参会记录，请联系现场工作人员");
        }

        String tail = phoneTail == null ? "" : phoneTail.trim();
        if (candidates.size() > 1) {
            if (tail.length() != 4) {
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("needPhoneTail", true);
                return body;
            }
            candidates.removeIf((guest) -> guest.getPhone() == null || !guest.getPhone().endsWith(tail));
            if (candidates.size() != 1) {
                throw new BizException(ErrorCode.NOT_FOUND, "信息不匹配，请联系现场工作人员");
            }
        }

        ApplicationGuest guest = candidates.get(0);
        User user = authService.ensureWebUser(guest.getPhone(), guest.getName());

        byte[] raw = new byte[32];
        random.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);

        PassSession session = new PassSession();
        session.setTokenHash(AdminAccountService.sha256(token));
        session.setUserId(user.getId());
        session.setPassId(pass.getId());
        session.setExpiresAt(LocalDateTime.now().plusHours(SESSION_HOURS));
        session.setCreatedAt(LocalDateTime.now());
        passSessionMapper.insert(session);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("needPhoneTail", false);
        body.put("token", token);
        body.put("name", guest.getName());
        body.put("eventCity", pass.getEventCity());
        return body;
    }

    /** 首页、抽奖码等固定入口的二维码；不含任何密钥，扫码后仍需正常登录 */
    public Map<String, Object> entryQrCode(String target) {
        String hash = "lottery".equalsIgnoreCase(target) ? "#/lottery" : "#/home";
        String url = baseUrl().isEmpty() ? "" : baseUrl() + "/" + hash;
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("target", "lottery".equalsIgnoreCase(target) ? "lottery" : "home");
        body.put("url", url);
        if (!url.isEmpty()) body.put("qrBase64", qrCodeService.pngBase64(url));
        return body;
    }

    /** 通道会话 token → 用户；供 AuthInterceptor 使用 */
    public User resolveSession(String token) {
        if (token == null || token.isBlank()) return null;
        PassSession session = passSessionMapper.selectOne(new LambdaQueryWrapper<PassSession>()
                .eq(PassSession::getTokenHash, AdminAccountService.sha256(token.trim())));
        if (session == null || session.getExpiresAt() == null
                || session.getExpiresAt().isBefore(LocalDateTime.now())) {
            return null;
        }
        AccessPass pass = accessPassMapper.selectById(session.getPassId());
        if (pass == null || !Boolean.TRUE.equals(pass.getEnabled())) return null;
        if (pass.getExpiresAt() != null && pass.getExpiresAt().isBefore(LocalDateTime.now())) return null;
        return authService.findById(session.getUserId());
    }

    private AccessPass requirePass(String token) {
        String normalized = token == null ? "" : token.trim();
        AccessPass pass = normalized.isEmpty() ? null : accessPassMapper.selectOne(
                new LambdaQueryWrapper<AccessPass>().eq(AccessPass::getToken, normalized));
        if (pass == null || !Boolean.TRUE.equals(pass.getEnabled())) {
            throw new BizException(ErrorCode.UNAUTHORIZED, "通道无效");
        }
        if (pass.getExpiresAt() != null && pass.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new BizException(ErrorCode.UNAUTHORIZED, "通道已过期");
        }
        return pass;
    }

    private String cityOf(Application application) {
        var invitation = invitationService.getByCode(application.getInvitationCode());
        return invitation == null ? null : invitation.getEventCity();
    }

    /** 只有刚创建时才回传二维码，列表里不再重复下发完整链接 */
    private Map<String, Object> describe(AccessPass pass, boolean withQr) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", pass.getId());
        body.put("eventCity", pass.getEventCity());
        body.put("note", pass.getNote());
        body.put("enabled", pass.getEnabled());
        body.put("expiresAt", pass.getExpiresAt() == null ? null : pass.getExpiresAt().toString());
        body.put("createdAt", pass.getCreatedAt() == null ? null : pass.getCreatedAt().toString());
        String url = passUrl(pass.getToken());
        body.put("token", pass.getToken());
        body.put("url", url);
        if (withQr && !url.isBlank()) {
            body.put("qrBase64", qrCodeService.pngBase64(url));
        }
        return body;
    }

    private String passUrl(String token) {
        return baseUrl().isEmpty() ? "" : baseUrl() + "/?pass=" + token + "#/pass";
    }

    private String baseUrl() {
        if (webBaseUrl == null || webBaseUrl.isBlank()) return "";
        String base = webBaseUrl.trim();
        return base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
    }
}
