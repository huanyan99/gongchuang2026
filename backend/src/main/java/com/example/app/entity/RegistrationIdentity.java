package com.example.app.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/** 新登记的姓名+公司占位；历史数据不回填，以免旧重复阻断上线。 */
@Data
@TableName("gonghcuang_registration_identity")
public class RegistrationIdentity {
    @TableId(type = IdType.INPUT)
    private String identityKey;
    private Long applicationId;
}
