package com.example.app.controller;

import com.example.app.common.Result;
import com.example.app.config.UserContext;
import com.example.app.dto.LuckyCodeResponse;
import com.example.app.service.LotteryService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lottery")
@RequiredArgsConstructor
public class LotteryController {
    private final LotteryService lotteryService;

    @GetMapping("/me")
    public Result<LuckyCodeResponse> me() {
        return Result.ok(lotteryService.get(UserContext.require()));
    }

    @PostMapping("/draw")
    public Result<LuckyCodeResponse> draw() {
        return Result.ok(lotteryService.draw(UserContext.require()));
    }
}
