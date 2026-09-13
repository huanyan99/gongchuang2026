package com.example.app.controller;

import com.example.app.common.Result;
import com.example.app.dto.PassSessionRequest;
import com.example.app.service.PassService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** 现场通道：扫码后只验证姓名换取查看抽奖码与桌位的会话 */
@RestController
@RequestMapping("/api/pass")
@RequiredArgsConstructor
public class PassController {

    private final PassService passService;

    @PostMapping("/session")
    public Result<Map<String, Object>> session(@Valid @RequestBody PassSessionRequest req) {
        return Result.ok(passService.openSession(req.getPass(), req.getName(), req.getPhoneTail()));
    }
}
