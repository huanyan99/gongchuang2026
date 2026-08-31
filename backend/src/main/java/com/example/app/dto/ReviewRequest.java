package com.example.app.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/** 审核请求 */
@Data
public class ReviewRequest {
    @NotBlank(message = "审核结果不能为空")
    private String status; // APPROVED / REJECTED
    private String remark;
}
