package com.example.app.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/** 现场通道：二维码里的参数，扫码后只验证姓名即可查看抽奖码与桌位 */
@Data
@TableName("gonghcuang_access_pass")
public class AccessPass {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String token;

    /** 限定场次；为空表示不限场次 */
    private String eventCity;

    private String note;

    private Boolean enabled;

    private LocalDateTime expiresAt;

    private LocalDateTime createdAt;
}
