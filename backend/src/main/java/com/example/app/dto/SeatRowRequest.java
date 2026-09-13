package com.example.app.dto;

import lombok.Data;

/** 批量导入的单行桌位数据，字段校验在 SeatService 内逐行进行并回传行号 */
@Data
public class SeatRowRequest {
    private String name;
    private String phone;
    private String tableNo;
    private String remark;
}
