package com.example.app.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class User {
    private Long id;
    private String openid;
    private String nickname;
    private String avatarUrl;
    private LocalDateTime createdAt;
}
