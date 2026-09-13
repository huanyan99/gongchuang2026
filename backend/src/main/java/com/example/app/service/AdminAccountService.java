package com.example.app.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.example.app.common.BizException;
import com.example.app.common.ErrorCode;
import com.example.app.entity.AdminSession;
import com.example.app.entity.AdminUser;
import com.example.app.mapper.AdminSessionMapper;
import com.example.app.mapper.AdminUserMapper;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.spec.InvalidKeySpecException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 管理后台账号与会话。
 * - 口令用 PBKDF2-HMAC-SHA256 + 每账号随机盐存储，不可逆
 * - 会话 token 32 字节随机数，库里只存 SHA-256 摘要
 * - 连续失败锁定账号，并按来源 IP 限速，登录失败信息不区分「账号不存在」与「密码错误」
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AdminAccountService {

    private static final int ITERATIONS = 210_000;
    private static final int KEY_LENGTH = 256;
    private static final int MAX_FAILED = 5;
    private static final int LOCK_MINUTES = 15;
    private static final int SESSION_HOURS = 8;
    private static final int IP_MAX_ATTEMPTS = 20;
    private static final long IP_WINDOW_MILLIS = 10 * 60 * 1000L;

    private final AdminUserMapper adminUserMapper;
    private final AdminSessionMapper adminSessionMapper;
    private final SecureRandom random = new SecureRandom();
    private final Map<String, int[]> ipAttempts = new ConcurrentHashMap<>();

    @Value("${admin.bootstrap-username:}")
    private String bootstrapUsername;
    @Value("${admin.bootstrap-password:}")
    private String bootstrapPassword;

    /** 首次启动且库里没有账号时，用配置里的初始账号建一个，之后应立即改密 */
    @PostConstruct
    void bootstrap() {
        if (bootstrapUsername == null || bootstrapUsername.isBlank()
                || bootstrapPassword == null || bootstrapPassword.isBlank()) {
            return;
        }
        try {
            if (adminUserMapper.selectCount(new LambdaQueryWrapper<>()) > 0) return;
            create(bootstrapUsername.trim(), bootstrapPassword, "系统管理员");
            log.warn("已创建初始管理员账号 {}，请登录后立即修改口令", bootstrapUsername.trim());
        } catch (Exception e) {
            // 初始化失败不影响应用启动（例如库表尚未迁移）
            log.warn("初始管理员账号创建跳过: {}", e.getClass().getSimpleName());
        }
    }

    @Transactional
    public AdminUser create(String username, String rawPassword, String displayName) {
        String name = username == null ? "" : username.trim();
        if (name.length() < 4) throw new BizException(ErrorCode.BAD_REQUEST, "账号至少 4 位");
        requireStrongPassword(rawPassword);
        if (adminUserMapper.selectOne(byUsername(name)) != null) {
            throw new BizException(ErrorCode.CONFLICT, "账号已存在");
        }
        byte[] salt = new byte[16];
        random.nextBytes(salt);

        AdminUser admin = new AdminUser();
        admin.setUsername(name);
        admin.setPasswordSalt(Base64.getEncoder().encodeToString(salt));
        admin.setPasswordHash(hash(rawPassword, salt));
        admin.setDisplayName(displayName == null || displayName.isBlank() ? name : displayName.trim());
        admin.setEnabled(true);
        admin.setFailedCount(0);
        admin.setCreatedAt(LocalDateTime.now());
        adminUserMapper.insert(admin);
        return admin;
    }

    /** 登录：返回会话 token；失败信息统一，不暴露账号是否存在 */
    @Transactional
    public Map<String, Object> login(String username, String rawPassword, String clientIp) {
        throttleByIp(clientIp);
        String name = username == null ? "" : username.trim();
        AdminUser admin = name.isEmpty() ? null : adminUserMapper.selectOne(byUsername(name));

        if (admin == null || !Boolean.TRUE.equals(admin.getEnabled())) {
            throw new BizException(ErrorCode.UNAUTHORIZED, "账号或口令不正确");
        }
        if (admin.getLockedUntil() != null && admin.getLockedUntil().isAfter(LocalDateTime.now())) {
            throw new BizException(ErrorCode.UNAUTHORIZED, "账号已锁定，请稍后再试");
        }
        byte[] salt = Base64.getDecoder().decode(admin.getPasswordSalt());
        if (!constantTimeEquals(hash(rawPassword, salt), admin.getPasswordHash())) {
            recordFailure(admin);
            throw new BizException(ErrorCode.UNAUTHORIZED, "账号或口令不正确");
        }

        admin.setFailedCount(0);
        admin.setLockedUntil(null);
        admin.setLastLoginAt(LocalDateTime.now());
        adminUserMapper.updateById(admin);
        // 登录成功后作废该账号的旧会话，避免多处常驻
        adminSessionMapper.delete(new LambdaQueryWrapper<AdminSession>().eq(AdminSession::getAdminId, admin.getId()));

        byte[] raw = new byte[32];
        random.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);

        AdminSession session = new AdminSession();
        session.setTokenHash(sha256(token));
        session.setAdminId(admin.getId());
        session.setExpiresAt(LocalDateTime.now().plusHours(SESSION_HOURS));
        session.setCreatedAt(LocalDateTime.now());
        adminSessionMapper.insert(session);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("token", token);
        body.put("username", admin.getUsername());
        body.put("displayName", admin.getDisplayName());
        body.put("expiresAt", session.getExpiresAt().toString());
        return body;
    }

    /** 校验会话 token，过期或不存在都按未授权处理 */
    public AdminUser require(String token) {
        if (token == null || token.isBlank()) {
            throw new BizException(ErrorCode.UNAUTHORIZED);
        }
        AdminSession session = adminSessionMapper.selectOne(new LambdaQueryWrapper<AdminSession>()
                .eq(AdminSession::getTokenHash, sha256(token.trim())));
        if (session == null || session.getExpiresAt() == null
                || session.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new BizException(ErrorCode.UNAUTHORIZED);
        }
        AdminUser admin = adminUserMapper.selectById(session.getAdminId());
        if (admin == null || !Boolean.TRUE.equals(admin.getEnabled())) {
            throw new BizException(ErrorCode.UNAUTHORIZED);
        }
        return admin;
    }

    @Transactional
    public void logout(String token) {
        if (token == null || token.isBlank()) return;
        adminSessionMapper.delete(new LambdaQueryWrapper<AdminSession>()
                .eq(AdminSession::getTokenHash, sha256(token.trim())));
    }

    /** 改密：改完作废全部会话，需要重新登录 */
    @Transactional
    public void changePassword(AdminUser admin, String currentPassword, String newPassword) {
        byte[] salt = Base64.getDecoder().decode(admin.getPasswordSalt());
        if (!constantTimeEquals(hash(currentPassword, salt), admin.getPasswordHash())) {
            throw new BizException(ErrorCode.UNAUTHORIZED, "当前口令不正确");
        }
        requireStrongPassword(newPassword);
        byte[] nextSalt = new byte[16];
        random.nextBytes(nextSalt);
        admin.setPasswordSalt(Base64.getEncoder().encodeToString(nextSalt));
        admin.setPasswordHash(hash(newPassword, nextSalt));
        adminUserMapper.updateById(admin);
        adminSessionMapper.delete(new LambdaQueryWrapper<AdminSession>().eq(AdminSession::getAdminId, admin.getId()));
    }

    private void requireStrongPassword(String password) {
        String value = password == null ? "" : password;
        boolean longEnough = value.length() >= 12;
        boolean hasLetter = value.chars().anyMatch(Character::isLetter);
        boolean hasDigit = value.chars().anyMatch(Character::isDigit);
        boolean hasOther = value.chars().anyMatch((ch) -> !Character.isLetterOrDigit(ch));
        if (!longEnough || !hasLetter || !hasDigit || !hasOther) {
            throw new BizException(ErrorCode.BAD_REQUEST, "口令至少 12 位，且包含字母、数字和符号");
        }
    }

    private void recordFailure(AdminUser admin) {
        int failed = (admin.getFailedCount() == null ? 0 : admin.getFailedCount()) + 1;
        admin.setFailedCount(failed);
        if (failed >= MAX_FAILED) {
            admin.setFailedCount(0);
            admin.setLockedUntil(LocalDateTime.now().plusMinutes(LOCK_MINUTES));
        }
        adminUserMapper.updateById(admin);
    }

    /** 同一来源 IP 的登录尝试限速，挡住撞库 */
    private void throttleByIp(String clientIp) {
        if (clientIp == null || clientIp.isBlank()) return;
        long now = System.currentTimeMillis();
        int[] state = ipAttempts.compute(clientIp, (key, value) -> {
            if (value == null || now - value[1] > IP_WINDOW_MILLIS) return new int[]{1, (int) (now / 1000)};
            return new int[]{value[0] + 1, value[1]};
        });
        if (state[0] > IP_MAX_ATTEMPTS) {
            throw new BizException(ErrorCode.UNAUTHORIZED, "尝试过于频繁，请稍后再试");
        }
    }

    private LambdaQueryWrapper<AdminUser> byUsername(String username) {
        return new LambdaQueryWrapper<AdminUser>().eq(AdminUser::getUsername, username);
    }

    private String hash(String password, byte[] salt) {
        try {
            PBEKeySpec spec = new PBEKeySpec((password == null ? "" : password).toCharArray(), salt, ITERATIONS, KEY_LENGTH);
            SecretKeyFactory factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
            return Base64.getEncoder().encodeToString(factory.generateSecret(spec).getEncoded());
        } catch (java.security.NoSuchAlgorithmException | InvalidKeySpecException e) {
            throw new BizException(ErrorCode.INTERNAL_ERROR);
        }
    }

    static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder(bytes.length * 2);
            for (byte b : bytes) builder.append(String.format("%02x", b));
            return builder.toString();
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new BizException(ErrorCode.INTERNAL_ERROR);
        }
    }

    private boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null) return false;
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }
}
