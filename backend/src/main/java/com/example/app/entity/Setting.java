package com.example.app.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/** 后台可调整的运行期开关，键值对存储 */
@Data
@TableName("gonghcuang_setting")
public class Setting {

    @TableId(value = "setting_key", type = IdType.INPUT)
    private String settingKey;

    private String settingValue;

    private LocalDateTime updatedAt;
}
