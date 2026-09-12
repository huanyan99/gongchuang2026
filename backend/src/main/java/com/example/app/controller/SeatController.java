package com.example.app.controller;

import com.example.app.common.Result;
import com.example.app.config.UserContext;
import com.example.app.service.SeatService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** 嘉宾端桌位图：需登录，且参会登记审核通过 */
@RestController
@RequestMapping("/api/seat")
@RequiredArgsConstructor
public class SeatController {

    private final SeatService seatService;

    @GetMapping("/me")
    public Result<Map<String, Object>> me() {
        return Result.ok(seatService.mySeat(UserContext.require()));
    }
}
