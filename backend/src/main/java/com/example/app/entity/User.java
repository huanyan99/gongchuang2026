package com.example.app.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("gonghcuang_user")
public class User {

    @TableId(type = IdType.AUTO)
    private Long id;

    @JsonIgnore
    private String openid;

    private String nickname;

    private String avatarUrl;

    private String name;
    private String gender;

    /** 用户主动通过微信授权的手机号，不等同于手动登记手机号 */
    private String phone;
    private String phoneCountryCode;
    private LocalDateTime phoneVerifiedAt;

    /** 是否可以创建并管理自己的定向邀请 */
    private Boolean canInvite;

    /** 是否可以审核全部邀请记录 */
    private Boolean canReview;

    /** 首次登录设备的识别码；邀请人换设备需管理员解绑 */
    @JsonIgnore
    private String deviceId;

    @JsonIgnore
    private String token;

    @JsonIgnore
    private LocalDateTime tokenExpire;

    private LocalDateTime createdAt;
}
