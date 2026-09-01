package com.example.app.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("gonghcuang_invitation")
public class Invitation {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 邀请码，全局唯一 */
    private String code;

    /** 最大可用次数 */
    private Integer maxUses;

    /** 已使用次数（原子递增，防止并发超卖） */
    private Integer usedCount;

    private Long inviterUserId;

    private String inviterName;

    private String eventCity;

    private String guestName;

    private String guestCompany;

    private String guestPhone;

    private String note;

    private String status;

    private LocalDateTime expiresAt;

    private LocalDateTime createdAt;
}
