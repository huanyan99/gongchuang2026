package com.example.app.config;

import com.example.app.common.BizException;
import com.example.app.common.ErrorCode;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/**
 * 管理端密钥校验。
 * 生产 profile 下要求密钥 >= 16 位且非默认值，启动即失败，避免带弱密钥上线。
 */
@Component
public class AdminAuth {

    private static final String DEFAULT_PLACEHOLDER = "change-me-admin-key";

    @Value("${admin.key}")
    private String adminKey;

    private final Environment environment;

    public AdminAuth(Environment environment) {
        this.environment = environment;
    }

    @PostConstruct
    void validate() {
        boolean prod = Arrays.asList(environment.getActiveProfiles()).contains("prod");
        if (prod && (DEFAULT_PLACEHOLDER.equals(adminKey) || adminKey == null || adminKey.length() < 16)) {
            throw new IllegalStateException("生产环境 admin.key 必须为 >=16 位的非默认密钥");
        }
    }

    public void verify(String key) {
        // 恒定时间比较，防时序侧信道
        if (key == null || adminKey == null || !constantTimeEquals(key, adminKey)) {
            throw new BizException(ErrorCode.UNAUTHORIZED);
        }
    }

    private boolean constantTimeEquals(String a, String b) {
        byte[] ba = a.getBytes(StandardCharsets.UTF_8);
        byte[] bb = b.getBytes(StandardCharsets.UTF_8);
        if (ba.length != bb.length) return false;
        int diff = 0;
        for (int i = 0; i < ba.length; i++) diff |= ba[i] ^ bb[i];
        return diff == 0;
    }
}
