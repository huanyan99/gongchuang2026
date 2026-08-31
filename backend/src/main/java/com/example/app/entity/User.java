package com.example.app.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_user")
public class User {

    @TableId(type = IdType.AUTO)
    private Long id;

    @JsonIgnore
    private String openid;

    private String nickname;

    private String avatarUrl;

    @JsonIgnore
    private String token;

    @JsonIgnore
    private LocalDateTime tokenExpire;

    private LocalDateTime createdAt;
}
