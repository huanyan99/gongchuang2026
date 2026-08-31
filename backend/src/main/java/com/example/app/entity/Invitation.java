package com.example.app.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_invitation")
public class Invitation {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 邀请码，全局唯一 */
    private String code;

    /** 最大可用次数 */
    private Integer maxUses;

    /** 已使用次数（原子递增，防止并发超卖） */
    private Integer usedCount;

    private LocalDateTime createdAt;
}
