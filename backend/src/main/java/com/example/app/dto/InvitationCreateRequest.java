package com.example.app.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class InvitationCreateRequest {
    @NotBlank(message = "请选择邀请场次")
    @Pattern(regexp = "^(佛山|济南|上海)$", message = "邀请场次无效")
    private String eventCity;
    @Size(max = 64) private String guestName;
    @Size(max = 128) private String guestCompany;
    @Pattern(regexp = "^$|^1\\d{10}$", message = "手机号格式不正确")
    private String guestPhone;
    @Size(max = 256) private String note;
    @Min(1) @Max(100) private Integer maxUses = 1;
}
