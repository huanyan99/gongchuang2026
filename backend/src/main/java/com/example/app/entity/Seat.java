package com.example.app.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/** 桌位安排：一位嘉宾在某个场次的桌号，按「场次 + 手机号」唯一 */
@Data
@TableName("gonghcuang_seat")
public class Seat {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String eventCity;

    private String name;

    /** 与参会登记的同行人手机号对应，导入时按此匹配 */
    private String phone;

    private String tableNo;

    private String remark;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;
}
