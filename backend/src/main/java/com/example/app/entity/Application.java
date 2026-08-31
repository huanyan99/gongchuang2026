package com.example.app.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** 申报信息：受邀人填写的个人信息 */
@Data
public class Application {
    private Long id;
    private String invitationCode;
    private String name;
    private String phone;
    private String company;
    private String position;
    private String reason;
    /** PENDING / APPROVED / REJECTED */
    private String status;
    private String reviewRemark;
    private LocalDateTime createdAt;
    private LocalDateTime reviewedAt;
}
