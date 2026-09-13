package com.example.app.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/** 公众号一键登录链接里的 ticket */
@Data
public class TicketLoginRequest {
    @NotBlank
    @Size(max = 64)
    private String ticket;
}
