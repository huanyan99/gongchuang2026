package com.example.app.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import lombok.Data;

/** 生成现场通道二维码 */
@Data
public class AccessPassRequest {
    @Size(max = 32)
    private String eventCity;

    @Size(max = 128)
    private String note;

    /** 有效小时数，留空表示长期有效 */
    @Min(1)
    @Max(720)
    private Integer validHours;
}
