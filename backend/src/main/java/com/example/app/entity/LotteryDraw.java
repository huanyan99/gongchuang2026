package com.example.app.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("gonghcuang_lottery_draw")
public class LotteryDraw {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private String luckyCode;
    private LocalDateTime createdAt;
}
