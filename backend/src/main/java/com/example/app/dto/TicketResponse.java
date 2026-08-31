package com.example.app.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class TicketResponse {
    private Long applicationId;
    private String status;
    private String name;
    private String phone;
    private String ticketNo;
    /** 入场核验短时凭证；仅 APPROVED 时下发 */
    private String token;
    private String qrBase64;
    private Integer expireSeconds;
    private boolean checkedIn;
}
