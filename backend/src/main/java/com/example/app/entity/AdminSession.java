package com.example.app.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/** 管理后台会话：库里只存 token 的 SHA-256 摘要 */
@Data
@TableName("gonghcuang_admin_session")
public class AdminSession {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String tokenHash;

    private Long adminId;

    private LocalDateTime expiresAt;

    private LocalDateTime createdAt;
}
