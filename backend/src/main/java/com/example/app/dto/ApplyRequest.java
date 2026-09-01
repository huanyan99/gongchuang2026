package com.example.app.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Max;
import java.util.List;

/** 申报表单 */
@Data
public class ApplyRequest {
    @NotBlank(message = "邀请码不能为空")
    @Size(max = 16, message = "邀请码过长")
    private String invitationCode;
    @NotBlank(message = "姓名不能为空")
    @Size(max = 64, message = "姓名过长")
    private String name;
    @NotBlank(message = "手机号不能为空")
    @Pattern(regexp = "^1\\d{10}$", message = "手机号格式不正确")
    private String phone;
    @Size(max = 128, message = "公司名称过长")
    private String company;
    @Size(max = 64, message = "职位过长")
    private String position;
    @Size(max = 512, message = "备注过长")
    private String reason;
    @Min(1) @Max(10)
    private Integer attendeeCount;
    @Valid
    private List<GuestRequest> attendees;
}
