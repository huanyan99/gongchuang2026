package com.example.app.service;

import com.example.app.common.BizException;
import com.example.app.common.ErrorCode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.Base64;

/** 入场码短时 HMAC 凭证，避免把申报 ID 明文放进二维码 */
@Service
public class CheckinTokenService {

    private static final Duration TTL = Duration.ofMinutes(2);

    /** 入场码签名密钥；留空时启动随机生成，重启后旧二维码失效（有效期本就只有 2 分钟） */
    @Value("${app.checkin-secret:}")
    private String configuredSecret;

    private final String fallbackSecret = java.util.UUID.randomUUID().toString();

    private String secretSeed() {
        return configuredSecret == null || configuredSecret.isBlank() ? fallbackSecret : configuredSecret;
    }

    public Duration ttl() {
        return TTL;
    }

    public String issue(long applicationId) {
        long exp = System.currentTimeMillis() + TTL.toMillis();
        String payload = applicationId + ":" + exp;
        String body = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(payload.getBytes(StandardCharsets.UTF_8));
        return body + "." + hmacHex(payload);
    }

    public long parse(String token) {
        if (token == null || token.isBlank()) {
            throw new BizException(ErrorCode.CHECKIN_INVALID);
        }
        String[] parts = token.trim().split("\\.", 2);
        if (parts.length != 2) {
            throw new BizException(ErrorCode.CHECKIN_INVALID);
        }
        String payload;
        try {
            payload = new String(Base64.getUrlDecoder().decode(parts[0]), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            throw new BizException(ErrorCode.CHECKIN_INVALID);
        }
        if (!MessageDigest.isEqual(
                hmacHex(payload).getBytes(StandardCharsets.UTF_8),
                parts[1].getBytes(StandardCharsets.UTF_8))) {
            throw new BizException(ErrorCode.CHECKIN_INVALID);
        }
        String[] fields = payload.split(":", 2);
        if (fields.length != 2) {
            throw new BizException(ErrorCode.CHECKIN_INVALID);
        }
        try {
            long id = Long.parseLong(fields[0]);
            long exp = Long.parseLong(fields[1]);
            if (System.currentTimeMillis() > exp) {
                throw new BizException(ErrorCode.CHECKIN_EXPIRED);
            }
            return id;
        } catch (NumberFormatException e) {
            throw new BizException(ErrorCode.CHECKIN_INVALID);
        }
    }

    private String hmacHex(String payload) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secretSeed().getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] raw = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(raw.length * 2);
            for (byte b : raw) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException("HMAC 计算失败", e);
        }
    }
}
