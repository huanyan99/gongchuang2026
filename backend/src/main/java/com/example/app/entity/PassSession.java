package com.example.app.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/** 现场通道会话：只能访问抽奖码与桌位接口，库里只存 token 摘要 */
@Data
@TableName("gonghcuang_pass_session")
public class PassSession {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String tokenHash;

    private Long userId;

    private Long passId;

    private LocalDateTime expiresAt;

    private LocalDateTime createdAt;
}
