package com.example.app.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.Data;

import java.time.LocalDateTime;

/** 管理后台账号 */
@Data
@TableName("gonghcuang_admin_user")
public class AdminUser {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String username;

    @JsonIgnore
    private String passwordHash;

    @JsonIgnore
    private String passwordSalt;

    private String displayName;

    private Boolean enabled;

    /** 连续登录失败次数，达到阈值后锁定 */
    private Integer failedCount;

    private LocalDateTime lockedUntil;

    private LocalDateTime lastLoginAt;

    private LocalDateTime createdAt;
}
