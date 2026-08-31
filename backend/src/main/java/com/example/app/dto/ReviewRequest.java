package com.example.app.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

/** 审核请求 */
@Data
public class ReviewRequest {
    @NotBlank(message = "审核结果不能为空")
    @Pattern(regexp = "APPROVED|REJECTED", message = "审核结果只能是通过或驳回")
    private String status;
    @Size(max = 512, message = "审核备注过长")
    private String remark;
}
