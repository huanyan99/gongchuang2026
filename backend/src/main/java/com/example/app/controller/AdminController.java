package com.example.app.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.example.app.common.ApplyStatus;
import com.example.app.common.Result;
import com.example.app.config.AdminAuth;
import com.example.app.dto.CheckinRequest;
import com.example.app.dto.ReviewRequest;
import com.example.app.entity.Application;
import com.example.app.entity.Invitation;
import com.example.app.service.ApplicationService;
import com.example.app.service.InvitationService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/** 管理端接口：请求头需带 X-Admin-Key */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
@Validated
public class AdminController {

    private static final int MAX_PAGE_SIZE = 100;

    private final ApplicationService applicationService;
    private final InvitationService invitationService;
    private final AdminAuth adminAuth;

    /** 生成邀请码 */
    @PostMapping("/invitation")
    public Result<Invitation> createInvitation(
            @RequestParam(defaultValue = "100") @Min(1) @Max(100000) int maxUses,
            @RequestHeader("X-Admin-Key") String adminKey) {
        adminAuth.verify(adminKey);
        return Result.ok(invitationService.create(maxUses));
    }

    /** 申报分页列表，status 可选（PENDING/APPROVED/REJECTED） */
    @GetMapping("/applications")
    public Result<Map<String, Object>> list(
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") @Min(1) long page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(MAX_PAGE_SIZE) long size,
            @RequestHeader("X-Admin-Key") String adminKey) {
        adminAuth.verify(adminKey);
        if (status != null && !status.isBlank()) {
            status = ApplyStatus.of(status).name();
        }
        Page<Application> result = applicationService.page(page, size, status);
        Map<String, Object> body = new HashMap<>();
        body.put("records", result.getRecords());
        body.put("total", result.getTotal());
        body.put("page", result.getCurrent());
        body.put("size", result.getSize());
        body.put("pages", result.getPages());
        return Result.ok(body);
    }

    /** 审核申报 */
    @PostMapping("/applications/{id}/review")
    public Result<Application> review(@PathVariable @Min(1) Long id,
                                      @Valid @RequestBody ReviewRequest req,
                                      @RequestHeader("X-Admin-Key") String adminKey) {
        adminAuth.verify(adminKey);
        return Result.ok(applicationService.review(id, ApplyStatus.of(req.getStatus()), req.getRemark()));
    }

    /** 扫码入场核验 */
    @PostMapping("/checkin")
    public Result<Application> checkin(@Valid @RequestBody CheckinRequest req,
                                       @RequestHeader("X-Admin-Key") String adminKey) {
        adminAuth.verify(adminKey);
        return Result.ok(applicationService.checkIn(req.getToken()));
    }

    /** 按状态统计数量 */
    @GetMapping("/stats")
    public Result<Map<String, Long>> stats(@RequestHeader("X-Admin-Key") String adminKey) {
        adminAuth.verify(adminKey);
        Map<String, Long> stats = new HashMap<>();
        applicationService.countByStatus().forEach((status, count) ->
                stats.put(status.name().toLowerCase(), count));
        return Result.ok(stats);
    }
}
