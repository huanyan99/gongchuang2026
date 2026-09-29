package com.example.app.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/** 场次桌位定义：后台看板右侧的桌位卡片。人坐哪桌仍记录在 gonghcuang_seat。 */
@Data
@TableName("gonghcuang_table")
public class SeatTable {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String eventCity;

    private String tableNo;

    /** 预留：每桌容量，本期不校验、恒为空 */
    private Integer capacity;

    private Integer sortNo;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;
}
