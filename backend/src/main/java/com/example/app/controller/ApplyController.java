package com.example.app.controller;

import com.example.app.dto.ApplyRequest;
import com.example.app.dto.Result;
import com.example.app.entity.Application;
import com.example.app.service.ApplicationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/** 受邀人侧接口 */
@RestController
@RequestMapping("/api/apply")
@RequiredArgsConstructor
public class ApplyController {

    private final ApplicationService applicationService;

    /** 校验邀请码是否有效（打开邀请函时调用） */
    @GetMapping("/check-invitation")
    public Result<Boolean> checkInvitation(@RequestParam String code) {
        applicationService.checkInvitation(code);
        return Result.ok(true);
    }

    /** 提交申报 */
    @PostMapping
    public Result<Application> submit(@Valid @RequestBody ApplyRequest req) {
        return Result.ok(applicationService.submit(req));
    }

    /** 按手机号查询自己的审核状态 */
    @GetMapping("/status")
    public Result<Application> status(@RequestParam String phone) {
        return Result.ok(applicationService.checkStatus(phone));
    }
}
