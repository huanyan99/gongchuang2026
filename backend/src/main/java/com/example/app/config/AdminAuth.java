package com.example.app.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** 管理端鉴权：简单密钥比对，生产环境建议换成登录 + JWT */
@Component
public class AdminAuth {

    @Value("${admin.key}")
    private String adminKey;

    public void verify(String key) {
        if (key == null || !key.equals(adminKey)) {
            throw new IllegalArgumentException("管理密钥错误");
        }
    }
}
