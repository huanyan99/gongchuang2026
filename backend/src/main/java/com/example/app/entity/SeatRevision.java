package com.example.app.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/** 场次桌位版本号：管理员保存一次加一，用于多管理员并发时的乐观锁与「谁改的」留痕。 */
@Data
@TableName("gonghcuang_seat_revision")
public class SeatRevision {

    @TableId(value = "event_city", type = IdType.INPUT)
    private String eventCity;

    private Long revision;

    private Long updatedBy;

    private String updatedByName;

    private LocalDateTime updatedAt;
}
