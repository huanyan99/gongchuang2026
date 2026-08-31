package com.example.app.controller;

import com.example.app.dto.Result;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** 示例接口：前端首页调用，联调用 */
@RestController
@RequestMapping("/api")
public class DemoController {

    @GetMapping("/hello")
    public Result<Map<String, Object>> hello() {
        return Result.ok(Map.of("message", "Hello from backend"));
    }
}
