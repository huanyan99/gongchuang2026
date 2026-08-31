package com.example.app.controller;

import com.example.app.common.Result;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** 健康检查 / 联调示例 */
@RestController
@RequestMapping("/api")
public class DemoController {

    @GetMapping("/hello")
    public Result<Map<String, Object>> hello() {
        return Result.ok(Map.of("message", "Hello from backend"));
    }
}
