package com.example.app.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import com.baomidou.mybatisplus.annotation.TableField;
import java.util.List;

import java.time.LocalDateTime;

@Data
@TableName("gonghcuang_application")
public class Application {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 提交人，与登录用户绑定 */
    private Long userId;

    private String invitationCode;

    private String name;

    /** 手机号，数据库唯一索引兜底防重复 */
    private String phone;

    private String company;

    private String position;

    private String reason;

    /** 审核状态，见 ApplyStatus */
    private String status;

    private String reviewRemark;

    private LocalDateTime createdAt;

    private LocalDateTime reviewedAt;

    private LocalDateTime checkedInAt;

    /** 嘉宾主动修改次数，最多 2 次 */
    private Integer editCount;

    @TableField(exist = false)
    private List<ApplicationGuest> attendees;

    @TableField(exist = false)
    private String eventCity;
}
