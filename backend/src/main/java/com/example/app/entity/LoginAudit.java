package com.example.app.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/** 用户登录、设备冲突与管理员解绑审计记录。 */
@Data
@TableName("gonghcuang_login_audit")
public class LoginAudit {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private String loginType;
    private String result;
    private String reason;
    private String deviceHash;
    private String ipAddress;
    private String userAgent;
    private Long adminId;
    private String adminName;
    private LocalDateTime createdAt;
}
