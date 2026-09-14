package com.example.app.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.example.app.entity.AdminUser;
import com.example.app.entity.LoginAudit;
import com.example.app.entity.User;
import com.example.app.mapper.LoginAuditMapper;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.HexFormat;

@Slf4j
@Service
@RequiredArgsConstructor
public class LoginAuditService {
    private final LoginAuditMapper loginAuditMapper;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordLogin(User user, String loginType, String deviceId, String result, String reason) {
        LoginAudit row = base(user == null ? null : user.getId(), loginType, result, reason);
        row.setDeviceHash(hashDevice(deviceId));
        loginAuditMapper.insert(row);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordAdminReset(User user, AdminUser admin) {
        LoginAudit row = base(user.getId(), "ADMIN_RESET", "SUCCESS", "管理员解绑设备");
        row.setDeviceHash(hashDevice(user.getDeviceId()));
        row.setAdminId(admin.getId());
        row.setAdminName(admin.getDisplayName() == null || admin.getDisplayName().isBlank()
                ? admin.getUsername() : admin.getDisplayName());
        loginAuditMapper.insert(row);
    }

    public Page<LoginAudit> page(Long userId, long page, long size) {
        LambdaQueryWrapper<LoginAudit> query = new LambdaQueryWrapper<LoginAudit>().orderByDesc(LoginAudit::getId);
        if (userId != null) query.eq(LoginAudit::getUserId, userId);
        return loginAuditMapper.selectPage(Page.of(page, size), query);
    }

    private LoginAudit base(Long userId, String type, String result, String reason) {
        LoginAudit row = new LoginAudit();
        row.setUserId(userId);
        row.setLoginType(type);
        row.setResult(result);
        row.setReason(reason);
        row.setCreatedAt(LocalDateTime.now());
        ServletRequestAttributes attrs = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attrs != null) {
            HttpServletRequest request = attrs.getRequest();
            String forwarded = request.getHeader("X-Forwarded-For");
            row.setIpAddress(forwarded == null || forwarded.isBlank()
                    ? request.getRemoteAddr() : forwarded.split(",")[0].trim());
            String agent = request.getHeader("User-Agent");
            row.setUserAgent(agent == null ? null : agent.substring(0, Math.min(agent.length(), 255)));
        }
        return row;
    }

    private String hashDevice(String deviceId) {
        if (deviceId == null || deviceId.isBlank()) return null;
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(deviceId.trim().getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest).substring(0, 16);
        } catch (Exception e) {
            log.warn("设备标识摘要生成失败: {}", e.getClass().getSimpleName());
            return null;
        }
    }
}
