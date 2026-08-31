package com.example.app.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** 邀请码 */
@Data
public class Invitation {
    private Long id;
    private String code;
    private Integer maxUses;
    private Integer usedCount;
    private LocalDateTime createdAt;
}
