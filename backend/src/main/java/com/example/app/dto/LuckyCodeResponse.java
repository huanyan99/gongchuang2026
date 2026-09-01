package com.example.app.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class LuckyCodeResponse {
    private String luckyCode;
    private boolean newlyDrawn;
}
