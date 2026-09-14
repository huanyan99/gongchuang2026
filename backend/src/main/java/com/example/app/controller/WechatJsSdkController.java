package com.example.app.controller;

import com.example.app.common.Result;
import com.example.app.service.WechatJsSdkService;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/wechat")
@RequiredArgsConstructor
@Validated
public class WechatJsSdkController {
    private final WechatJsSdkService wechatJsSdkService;

    @GetMapping("/js-sdk-signature")
    public Result<Map<String, Object>> signature(@RequestParam @Size(max = 2048) String url) {
        return Result.ok(wechatJsSdkService.signature(url));
    }
}
