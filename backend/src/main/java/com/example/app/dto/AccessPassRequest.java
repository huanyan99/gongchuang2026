package com.example.app.dto;

import jakarta.validation.constraints.Size;
import lombok.Data;

/** 生成桌位图现场通道二维码；通道长期有效，需要时由管理员停用 */
@Data
public class AccessPassRequest {
    @Size(max = 32)
    private String eventCity;

    @Size(max = 128)
    private String note;
}
